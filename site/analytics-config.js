/*
 * Umami is optional and disabled by default.
 *
 * To enable it:
 *   1. Create a website in your Umami instance and copy its website ID.
 *   2. Set umamiSrc to the script URL, e.g.
 *      https://analytics.example.com/script.js
 *      (Umami Cloud: https://cloud.umami.is/script.js)
 *   3. Set websiteId to the UUID from Umami.
 *   4. Update the privacy note and the footer text if needed.
 *
 * The public site stays tracker-free while both values are empty.
 */
window.HUSTL_ANALYTICS = {
  umamiSrc: '',
  websiteId: '',
}
