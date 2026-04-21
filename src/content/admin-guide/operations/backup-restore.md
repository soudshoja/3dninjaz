---
title: What's backed up and where
category: Operations
tags: [backup, restore, database]
order: 4
---

# What's backed up and where

## What the store stores

Your store has two types of data to protect:

### Database (MariaDB)

This contains everything important:
- All orders and order history
- All customer accounts
- All products, variants, categories
- Payment records
- Email subscribers
- Settings and templates

**Where it lives:** cPanel MariaDB on your hosting server (`3dninjaz.com`).

**How to back up:**
1. Log into cPanel (`https://3dninjaz.com:2083`).
2. Go to **phpMyAdmin** or **Backup**.
3. Export the full database as a `.sql` file.
4. Save it to your computer and to a cloud drive (Google Drive or Dropbox).

**How often:** Monthly at minimum. Weekly is safer if you're actively adding products and taking orders.

### Product images

Product photos are stored on the server at `public/uploads/products/`.

**Where it lives:** The server's filesystem.

**How to back up:**
1. Connect via FTP (FileZilla or similar) using your cPanel FTP credentials.
2. Download the `public/uploads/` folder to your computer.
3. Save to an external drive or cloud storage.

## What is NOT backed up automatically

There is no automatic backup system configured out of the box. You must do this manually, or ask your server administrator to set up an automated backup cron job.

## Restoring from backup

If something goes wrong (accidental deletion, server crash):
- For database: import the `.sql` file via phpMyAdmin → Import.
- For images: re-upload the folder via FTP.

Contact your server administrator for help with restoration — it's a technical process.

## Recommendation

Create a shared folder in Google Drive or Dropbox for store backups. Once a month, export the database and upload the new export to that folder. Label the files by date (e.g., `db-backup-2026-04-01.sql`).

This takes 5 minutes and protects months of work.
