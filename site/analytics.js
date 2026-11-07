;(() => {
  const config = window.HUSTL_ANALYTICS || {}
  if (!config.umamiSrc || !config.websiteId) return
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return

  const script = document.createElement('script')
  script.defer = true
  script.src = config.umamiSrc
  script.dataset.websiteId = config.websiteId
  script.dataset.doNotTrack = 'true'
  document.head.appendChild(script)
})()
