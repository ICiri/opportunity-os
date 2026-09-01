# Opportunity OS Safe Autofill

Local Manifest V3 extension for reviewed job-application forms. It fills basic contact fields, highlights every changed field and never clicks Continue or Submit. File uploads, work authorization, compensation, demographic and free-text answers always remain manual.

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this directory.
4. Open extension settings and save the local profile.
5. Open an application form, click the extension and select **Fill this form**.
6. Review every field, attach the reviewed CV and submit manually.

The profile is stored only in `chrome.storage.local`. The extension has no host-wide permission, background worker, analytics, network request or API-key field. `activeTab` access exists only after the user clicks the extension.
