# GitHub Support için hassas veri temizleme başvuru taslağı

Bu bir taslaktır; destek mesajı gönderilmedi. Gerçek kullanıcı adı, şifre veya hesap URL'si içermez.

## Hazır başvuru metni

Repository: `mkizilkan/kizilkan-player-elite`

An account export containing usernames, passwords and credential-bearing playlist URLs was accidentally committed to this public repository. We have removed the file from all affected branch and tag histories and added a Git ignore rule to prevent accidental recommits.

- Sensitive file: `KIZILKAN-HESAP-ARSIVI-579-2026-10-07.txt`
- First changed / tainted commit: `b7e62889b8d5070a81d4e34d2521186eeb8d8c8e`
- Replacement clean commit: `e808273e7bf5f984e15785c787c73c4068dd471b`
- Affected branch: `refs/heads/v18.7.25-rc1-contenttest-parallel-ui-macsafety`
- Affected tag: `refs/tags/build-146`
- Both references were updated together using an atomic push and exact old-SHA force-with-lease checks.
- Associated PR query returned no matching pull requests (affected PR count: 0).
- The forks API returned zero forks during verification.
- LFS was not used for this file.

The repository owner explicitly authorized making the repository temporarily private. This was completed after cleanup. Anonymous HEAD requests for the repository page, the old-commit contents API endpoint and the old-commit raw file URL all returned HTTP 404. The owner would like to evaluate returning to public visibility only after retained sensitive objects and cached views are dealt with.

Verification after the push: the file returns HTTP 404 for both the current branch and the `build-146` tag. However, GitHub's contents API still serves the file when explicitly requested by the old commit SHA. Please evaluate removal of the cached views and orphaned commit/blob data, and any retained internal references that keep this credential export accessible. The credentials have not been rotated by the tool doing this Git cleanup; the repository owner must handle credential revocation/rotation with the relevant providers.

Please do not request or expose the credential contents in a public issue.

## Kullanıcı için takip

GitHub'ın [hassas veri temizleme belgesi](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository), geçmiş yeniden yazıldıktan sonra eski SHA/cache ve başka kopyaların ayrıca ele alınması gerektiğini açıklıyor. Başvuru [GitHub Support](https://support.github.com/) üzerinden yapılabilir; GitHub talebin destek kapsamına girip girmediğini değerlendirir.

Depoyu geçici özel yapma, hesap bilgilerini değiştirme ve Support tarafındaki kalıcı temizlik ayrı adımlardır. Kullanıcının açık onayıyla PRIVATE değişikliği tamamlandı ve anonim erişimin kapandığı doğrulandı. Hesap şifreleri değiştirilmedi; destek talebi gönderilmedi.
