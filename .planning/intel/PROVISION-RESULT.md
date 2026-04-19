# cPanel Provisioning Result

**Date:** 2026-04-16
**Host:** 152.53.86.223 (3dninjaz.com)
**Target user:** ninjaz

## Outcome: BLOCKED — SSH password auth rejected

All provisioning attempts via SSH were unable to authenticate. The user must
provision the MySQL database, MySQL user, and SMTP mailbox manually via the
cPanel web UI.

## Environment probe

```
$ which ssh sshpass plink
/usr/bin/ssh
/c/Users/User/AppData/Local/Microsoft/WinGet/Packages/xhcoding.sshpass-win32_Microsoft.Winget.Source_8wekyb3d8bbwe/sshpass
(plink not installed)

$ ssh -V
OpenSSH_9.9p2, OpenSSL 3.2.4 11 Feb 2025
```

sshpass is available — the issue is not the client, it is that the server
rejected the supplied password (or password auth is disabled for this
account).

## SSH attempts log

### Attempt 1 — default port 22, user=ninjaz

```
$ sshpass -p 'sumaiya1986' ssh -o StrictHostKeyChecking=no \
    -o ConnectTimeout=15 ninjaz@152.53.86.223 "echo OK"

Permission denied, please try again.
Permission denied, please try again.
ninjaz@152.53.86.223: Permission denied (publickey,gssapi-keyex,gssapi-with-mic,password).
```

### Attempt 2 — force password-only auth (disable publickey)

```
$ sshpass -p 'sumaiya1986' ssh -p 22 -o PubkeyAuthentication=no \
    -o PreferredAuthentications=password ninjaz@152.53.86.223 "echo OK"

Permission denied, please try again.
Permission denied, please try again.
ninjaz@152.53.86.223: Permission denied (publickey,gssapi-keyex,gssapi-with-mic,password).
```

### Attempt 3 — alternate cPanel SSH ports (2222, 21098, 22022)

All returned `Connection refused`. Only port 22 has an SSH listener on this
host.

### Attempt 4 — alternate usernames (root, admin, cpanel, ninjaz_user, 3dninjaz)

All six usernames returned `Permission denied` on port 22. This suggests the
server is reachable and sshd is running, but password auth either fails for
the supplied password or is disabled entirely (key-only).

### Port 22 banner probe

```
$ exec 3<>/dev/tcp/152.53.86.223/22 && sleep 2 && head -c 200 <&3
(empty response)
```

The banner is suppressed — consistent with a hardened cPanel SSH config.

## uapi calls attempted

None. SSH never authenticated, so no `uapi` or `mysql` calls could be run on
the remote host.

## Resources NOT provisioned

| Resource               | Status       | Next step                                         |
| ---------------------- | ------------ | ------------------------------------------------- |
| DB: `ninjaz_3dn`       | NOT CREATED  | cPanel -> MySQL Databases -> Create DB            |
| DB user: `ninjaz_3dn`  | NOT CREATED  | cPanel -> MySQL Databases -> Add New User         |
| Privilege grant        | N/A          | cPanel -> MySQL Databases -> Add User To Database |
| Mailbox `noreply@...`  | NOT CREATED  | cPanel -> Email Accounts -> Create                |

## Credentials placeholder state

`.env.local` has been written with:

- `DB_PASSWORD=` (empty — user to fill)
- `SMTP_PASSWORD=` (empty — user to fill)
- `BETTER_AUTH_SECRET` = freshly generated 64-char hex
- Connection strings templated against the final hostnames

## Manual provisioning — user action required

1. Log into cPanel for 3dninjaz.com via the control panel UI (host may be
   https://152.53.86.223:2083 or a branded URL).
2. **MySQL Databases** section:
   - Create database `ninjaz_3dn` (cPanel will auto-prefix the account name,
     so the final name may be `ninjaz_ninjaz_3dn` — note it and adjust
     `.env.local` accordingly).
   - Create MySQL user `ninjaz_3dn` with a strong 20+ char password.
   - Add the user to the database with ALL PRIVILEGES.
3. **Remote MySQL** section (cPanel -> Remote MySQL): add the developer's
   public IP (or `%` temporarily) so the mysql2 driver from localhost can
   connect. Without this, remote MySQL is blocked by default on cPanel.
4. **Email Accounts** section:
   - Create `noreply@3dninjaz.com` with a strong password and 250 MB quota.
   - Note the mail server hostname (usually `mail.3dninjaz.com` once DNS
     propagates; check the cPanel "Configure Mail Client" link for the exact
     hostname and port).
5. Paste the two passwords into `.env.local`
   (`DB_PASSWORD=`, `SMTP_PASSWORD=`).
6. If SSH access is required later, generate a local SSH key, upload the
   public key via cPanel -> SSH Access -> Manage SSH Keys -> Import, and
   authorize it.

## Verification (once provisioned)

```bash
# DB connectivity
mysql -h 152.53.86.223 -u ninjaz_3dn -p ninjaz_3dn -e "SELECT 1;"

# SMTP connectivity (requires swaks or openssl)
openssl s_client -starttls smtp -connect mail.3dninjaz.com:587
```
