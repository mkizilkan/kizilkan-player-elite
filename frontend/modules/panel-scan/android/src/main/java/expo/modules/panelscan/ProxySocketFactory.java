package expo.modules.panelscan;

import java.io.*;
import java.net.*;
import javax.net.SocketFactory;
import javax.net.ssl.*;

/** Explicit SOCKS4a / SOCKS5 negotiation; credentials belong to this connection only. */
public final class ProxySocketFactory extends SocketFactory {
  private final String scheme, host, user, password;
  private final int port;
  public ProxySocketFactory(String scheme, String host, int port, String user, String password) {
    this.scheme = scheme; this.host = host; this.port = port;
    this.user = user == null ? "" : user; this.password = password == null ? "" : password;
  }
  @Override public Socket createSocket() { return scheme.equals("https") ? new TunnelSocket() : new SocksSocket(); }
  @Override public Socket createSocket(String h, int p) throws IOException { Socket s=createSocket(); s.connect(new InetSocketAddress(h,p)); return s; }
  @Override public Socket createSocket(String h, int p, InetAddress l, int lp) throws IOException { Socket s=createSocket(); s.bind(new InetSocketAddress(l,lp)); s.connect(new InetSocketAddress(h,p)); return s; }
  @Override public Socket createSocket(InetAddress h, int p) throws IOException { return createSocket(h.getHostAddress(),p); }
  @Override public Socket createSocket(InetAddress h, int p, InetAddress l, int lp) throws IOException { return createSocket(h.getHostAddress(),p,l,lp); }

  private final class TunnelSocket extends Socket {
    private volatile Socket wire = new Socket();
    @Override public void connect(SocketAddress address) throws IOException { connect(address,0); }
    @Override public void connect(SocketAddress address, int timeout) throws IOException {
      if (!(address instanceof InetSocketAddress)) throw new IOException("PROXY_PROTOCOL_ADDRESS");
      InetSocketAddress target=(InetSocketAddress)address;
      try {
        wire.connect(new InetSocketAddress(host,port),timeout);
        // A socket negotiation is a read, too. Apply the connect budget until negotiation ends.
        int readTimeout=wire.getSoTimeout(); wire.setSoTimeout(timeout > 0 ? timeout : 10000);
        if (scheme.equals("https")) {
          SSLSocket tls=(SSLSocket)((SSLSocketFactory)SSLSocketFactory.getDefault()).createSocket(wire,host,port,true);
          SSLParameters params=tls.getSSLParameters(); params.setEndpointIdentificationAlgorithm("HTTPS");
          tls.setSSLParameters(params); wire=tls; tls.startHandshake();
        } else if (scheme.equals("socks4")) {
          if (!password.isEmpty()) throw new IOException("SOCKS4_PASSWORD_UNSUPPORTED");
          socks4(wire,target.getHostString(),target.getPort(),user);
        } else if (scheme.equals("socks5")) socks5(wire,target.getHostString(),target.getPort(),user,password);
        wire.setSoTimeout(readTimeout);
      } catch (IOException | RuntimeException e) { wire.close(); throw e; }
    }
    @Override public void bind(SocketAddress a) throws IOException { wire.bind(a); }
    @Override public InputStream getInputStream() throws IOException { return wire.getInputStream(); }
    @Override public OutputStream getOutputStream() throws IOException { return wire.getOutputStream(); }
    @Override public void close() throws IOException { wire.close(); }
    @Override public void setSoTimeout(int t) throws SocketException { wire.setSoTimeout(t); }
    @Override public int getSoTimeout() throws SocketException { return wire.getSoTimeout(); }
    @Override public void setTcpNoDelay(boolean v) throws SocketException { wire.setTcpNoDelay(v); }
    @Override public boolean getTcpNoDelay() throws SocketException { return wire.getTcpNoDelay(); }
    @Override public void setKeepAlive(boolean v) throws SocketException { wire.setKeepAlive(v); }
    @Override public boolean getKeepAlive() throws SocketException { return wire.getKeepAlive(); }
    @Override public boolean isConnected() { return wire.isConnected(); }
    @Override public boolean isClosed() { return wire.isClosed(); }
    @Override public boolean isBound() { return wire.isBound(); }
    @Override public boolean isInputShutdown() { return wire.isInputShutdown(); }
    @Override public boolean isOutputShutdown() { return wire.isOutputShutdown(); }
    @Override public InetAddress getInetAddress() { return wire.getInetAddress(); }
    @Override public InetAddress getLocalAddress() { return wire.getLocalAddress(); }
    @Override public int getPort() { return wire.getPort(); }
    @Override public int getLocalPort() { return wire.getLocalPort(); }
    @Override public SocketAddress getRemoteSocketAddress() { return wire.getRemoteSocketAddress(); }
    @Override public SocketAddress getLocalSocketAddress() { return wire.getLocalSocketAddress(); }
    @Override public void shutdownInput() throws IOException { wire.shutdownInput(); }
    @Override public void shutdownOutput() throws IOException { wire.shutdownOutput(); }
  }
  private static byte[] utf8(String s) { return s.getBytes(java.nio.charset.StandardCharsets.UTF_8); }
  private static byte[] read(InputStream in, int n) throws IOException {
    byte[] b=new byte[n]; int p=0;
    while(p<n) { int got=in.read(b,p,n-p); if(got<0) throw new EOFException("PROXY_PROTOCOL_EOF"); p+=got; }
    return b;
  }
  private static void socks4(Socket socket, String host, int port, String user) throws IOException {
    byte[] u=utf8(user), h=utf8(host);
    if(u.length>255 || user.indexOf('\0')>=0 || h.length>255) throw new IOException("PROXY_PROTOCOL_LENGTH");
    ByteArrayOutputStream request=new ByteArrayOutputStream();
    if(host.contains(":"))throw new IOException("PROXY_PROTOCOL_SOCKS4_IPV6_UNSUPPORTED");
    boolean literal=host.matches("\\d{1,3}(\\.\\d{1,3}){3}");
    byte[] address=literal?InetAddress.getByName(host).getAddress():new byte[]{0,0,0,1};
    request.write(new byte[]{4,1,(byte)(port>>8),(byte)port});request.write(address);
    request.write(u); request.write(0); if(!literal){request.write(h); request.write(0);}
    socket.getOutputStream().write(request.toByteArray()); socket.getOutputStream().flush();
    byte[] reply=read(socket.getInputStream(),8);
    if(reply[0]!=0)throw new IOException("PROXY_PROTOCOL_SOCKS4_VERSION");
    if((reply[1]&255)==91)throw new IOException("TARGET_REJECTED");
    if((reply[1]&255)!=90)throw new IOException("PROXY_AUTH_SOCKS4_REJECT");
  }
  private static void socks5(Socket socket, String host, int port, String user, String password) throws IOException {
    InputStream in=socket.getInputStream(); OutputStream out=socket.getOutputStream();
    boolean auth=!user.isEmpty();
    out.write(auth ? new byte[]{5,1,2} : new byte[]{5,1,0}); out.flush();
    byte[] reply=read(in,2);
    if(reply[0]!=5 || (reply[1]&255)!=(auth?2:0)) throw new IOException("PROXY_AUTH_METHOD");
    if(auth) {
      byte[] u=utf8(user), p=utf8(password);
      if(u.length<1 || u.length>255 || p.length<1 || p.length>255) throw new IOException("PROXY_AUTH_LENGTH");
      out.write(1); out.write(u.length); out.write(u); out.write(p.length); out.write(p); out.flush();
      reply=read(in,2); if(reply[0]!=1 || reply[1]!=0) throw new IOException("PROXY_AUTH_REJECT");
    }
    byte[] h=utf8(host); if(h.length<1 || h.length>255) throw new IOException("PROXY_PROTOCOL_LENGTH");
    out.write(new byte[]{5,1,0});
    if(host.contains(":")){out.write(4);out.write(InetAddress.getByName(host).getAddress());}
    else if(host.matches("\\d{1,3}(\\.\\d{1,3}){3}")){out.write(1);out.write(InetAddress.getByName(host).getAddress());}
    else {out.write(3);out.write(h.length);out.write(h);}
    out.write(new byte[]{(byte)(port>>8),(byte)port}); out.flush();
    reply=read(in,4);
    if(reply[0]!=5 || reply[2]!=0)throw new IOException("PROXY_PROTOCOL_SOCKS5_VERSION");
    int status=reply[1]&255;
    if(status>=2 && status<=6)throw new IOException("TARGET_UNREACHABLE_"+status);
    if(status!=0)throw new IOException("PROXY_PROTOCOL_SOCKS5_REJECT");
    int type=reply[3]&255; int n=type==1 ? 4 : type==4 ? 16 : type==3 ? (read(in,1)[0]&255) : -1;
    if(n<0) throw new IOException("PROXY_PROTOCOL_ADDRESS"); read(in,n+2);
  }
  // Preserve the actual Socket file descriptor for Android's TLS implementation.
  private final class SocksSocket extends Socket {
    @Override public void connect(SocketAddress address) throws IOException { connect(address,0); }
    @Override public void connect(SocketAddress address, int timeout) throws IOException {
      if (!(address instanceof InetSocketAddress)) throw new IOException("PROXY_PROTOCOL_ADDRESS");
      InetSocketAddress target=(InetSocketAddress)address;
      try {
        super.connect(new InetSocketAddress(host,port),timeout);
        int old=getSoTimeout(); setSoTimeout(timeout>0?timeout:10000);
        if(scheme.equals("socks4")) {
          if(!password.isEmpty()) throw new IOException("SOCKS4_PASSWORD_UNSUPPORTED");
          socks4(this,target.getHostString(),target.getPort(),user);
        } else socks5(this,target.getHostString(),target.getPort(),user,password);
        setSoTimeout(old);
      } catch(IOException | RuntimeException error) { close(); throw error; }
    }
  }
}
