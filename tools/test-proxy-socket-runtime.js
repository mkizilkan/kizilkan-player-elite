#!/usr/bin/env node
// Production Java socket factory against local fake gateways. No public proxies/accounts.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'kizilkan-socks-test-'));
const source=path.join(root,'frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ProxySocketFactory.java');
const fixture=String.raw`package expo.modules.panelscan;
import java.io.*; import java.net.*; import java.util.*; import java.util.concurrent.*;
public class SocketFixture {
  interface Handler { void run(Socket s) throws Exception; }
  static byte[] read(InputStream in,int n)throws Exception { byte[] b=in.readNBytes(n);if(b.length!=n)throw new EOFException();return b; }
  static String zero(InputStream in)throws Exception { ByteArrayOutputStream b=new ByteArrayOutputStream();int v;while((v=in.read())>0)b.write(v);return b.toString("UTF-8"); }
  static void eq(Object a,Object b) { if(!Objects.equals(a,b))throw new AssertionError(a+" != "+b); }
  static void run(String scheme,String user,String pass,String target,int budget,Handler handler,String error)throws Exception {
    ExecutorService worker=Executors.newSingleThreadExecutor();
    try(ServerSocket server=new ServerSocket(0,1,InetAddress.getLoopbackAddress())) {
      Future<?> task=worker.submit(()->{try(Socket s=server.accept()){s.setSoTimeout(3000);handler.run(s);}catch(Exception e){throw new RuntimeException(e);}});
      Socket proxy=new ProxySocketFactory(scheme,"127.0.0.1",server.getLocalPort(),user,pass).createSocket();
      try { proxy.connect(InetSocketAddress.createUnresolved(target,80),budget);if(error!=null)throw new AssertionError("accepted "+error);
        proxy.getOutputStream().write(123);eq(proxy.getInputStream().read(),124);
      }catch(IOException e){if(error==null||!e.toString().contains(error))throw e;}finally{proxy.close();}
      task.get(5,TimeUnit.SECONDS);
    }finally{worker.shutdownNow();}
  }
  static void relay(Socket s)throws Exception {eq(s.getInputStream().read(),123);s.getOutputStream().write(124);}
  static void greeting(Socket s,boolean auth)throws Exception {eq(Arrays.toString(read(s.getInputStream(),3)),Arrays.toString(new byte[]{5,1,(byte)(auth?2:0)}));s.getOutputStream().write(new byte[]{5,(byte)(auth?2:0)});}
  public static void main(String[] args)throws Exception {
    run("socks4","userid",null,"not-resolvable.invalid",1000,s->{InputStream in=s.getInputStream();eq(Arrays.toString(read(in,8)),"[4, 1, 0, 80, 0, 0, 0, 1]");eq(zero(in),"userid");eq(zero(in),"not-resolvable.invalid");s.getOutputStream().write(new byte[]{0,90,0,0,0,0,0,0});relay(s);},null);
    run("socks4",null,null,"192.0.2.1",1000,s->{eq(Arrays.toString(read(s.getInputStream(),8)),"[4, 1, 0, 80, -64, 0, 2, 1]");eq(zero(s.getInputStream()),"");s.getOutputStream().write(new byte[]{0,90,0,0,0,0,0,0});relay(s);},null);
    run("socks4",null,"unsupported","x.invalid",1000,s->{eq(s.getInputStream().read(),-1);},"PASSWORD_UNSUPPORTED");
    run("socks4",null,null,"x.invalid",1000,s->{read(s.getInputStream(),8);zero(s.getInputStream());zero(s.getInputStream());s.getOutputStream().write(new byte[]{0,91,0,0,0,0,0,0});},"TARGET_REJECTED");
    run("socks5","paid-user","p:@#", "dns.invalid",1000,s->{greeting(s,true);InputStream in=s.getInputStream();eq(in.read(),1);eq(new String(read(in,in.read()),"UTF-8"),"paid-user");eq(new String(read(in,in.read()),"UTF-8"),"p:@#");s.getOutputStream().write(new byte[]{1,0});eq(Arrays.toString(read(in,4)),"[5, 1, 0, 3]");eq(new String(read(in,in.read()),"UTF-8"),"dns.invalid");read(in,2);s.getOutputStream().write(new byte[]{5,0,0,1,0,0,0,0,0,80});relay(s);},null);
    for(String target:new String[]{"192.0.2.2","2001:db8::1"})run("socks5",null,null,target,1000,s->{greeting(s,false);InputStream in=s.getInputStream();eq(Arrays.toString(read(in,3)),"[5, 1, 0]");int type=in.read();eq(type,target.contains(":")?4:1);read(in,type==4?16:4);read(in,2);s.getOutputStream().write(new byte[]{5,0,0,1,0,0,0,0,0,80});relay(s);},null);
    run("socks5","bad","wrong","x.invalid",1000,s->{greeting(s,true);InputStream in=s.getInputStream();in.read();read(in,in.read());read(in,in.read());s.getOutputStream().write(new byte[]{1,1});},"AUTH_REJECT");
    run("socks5",null,null,"x.invalid",1000,s->{greeting(s,false);InputStream in=s.getInputStream();read(in,4);read(in,in.read());read(in,2);s.getOutputStream().write(new byte[]{5,4,0,1});},"TARGET_UNREACHABLE_4");
    run("socks5",null,null,"x.invalid",200,s->{read(s.getInputStream(),3);Thread.sleep(400);},"SocketTimeoutException");
    System.out.println("PASS: production SOCKS4a/4 IP, SOCKS5 remote DNS/IP/auth isolation, target rejection and negotiation timeout");
  }
}`;
try {
  const file=path.join(temp,'SocketFixture.java');fs.writeFileSync(file,fixture);
  const jdk=process.env.JAVA_HOME;const bin=name=>jdk?path.join(jdk,'bin',name+(process.platform==='win32'?'.exe':'')):name;
  execFileSync(bin('javac'),['-encoding','UTF-8','-d',temp,source,file],{timeout:30000,windowsHide:true});
  console.log(execFileSync(bin('java'),['-cp',temp,'expo.modules.panelscan.SocketFixture'],{encoding:'utf8',timeout:15000,windowsHide:true}).trim());
}finally{
  assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('kizilkan-socks-test-'));
  fs.rmSync(temp,{recursive:true,force:true});
}
