const header = document.querySelector('.site-header')
const menuButton = document.querySelector('.menu-btn')
const nav = document.getElementById('main-nav')
const lang = document.documentElement.lang === 'en' ? 'en' : 'de'
const labels =
  lang === 'en'
    ? { openMenu: 'Open menu', closeMenu: 'Close menu', copied: 'Copied', manual: 'Copy manually', enlarge: 'View larger' }
    : { openMenu: 'Menü öffnen', closeMenu: 'Menü schließen', copied: 'Kopiert', manual: 'Bitte manuell kopieren', enlarge: 'Größer ansehen' }

if (header) {
  const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 8)
  updateHeader()
  window.addEventListener('scroll', updateHeader, { passive: true })
}

if (menuButton && nav) {
  const closeNav = () => {
    nav.classList.remove('open')
    menuButton.setAttribute('aria-expanded', 'false')
    menuButton.setAttribute('aria-label', labels.openMenu)
  }

  menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('open')
    menuButton.setAttribute('aria-expanded', String(open))
    menuButton.setAttribute('aria-label', open ? labels.closeMenu : labels.openMenu)
  })

  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNav))

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const wasOpen = nav.classList.contains('open')
    closeNav()
    if (wasOpen) menuButton.focus()
  })

  document.addEventListener('click', (event) => {
    if (!nav.classList.contains('open')) return
    if (nav.contains(event.target) || menuButton.contains(event.target)) return
    closeNav()
  })
}

const reveals = document.querySelectorAll('.reveal')
if (reveals.length > 0) {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    reveals.forEach((element) => observer.observe(element))
  } else {
    reveals.forEach((element) => element.classList.add('is-visible'))
  }
}

const copyButton = document.querySelector('[data-copy]')
if (copyButton) {
  const original = copyButton.textContent
  copyButton.addEventListener('click', async () => {
    const pre = copyButton.closest('.terminal-body')?.querySelector('pre')
    const text = pre?.innerText ?? ''
    try {
      await navigator.clipboard.writeText(text)
      copyButton.textContent = labels.copied
    } catch {
      copyButton.textContent = labels.manual
    }
    window.setTimeout(() => {
      copyButton.textContent = original
    }, 2200)
  })
}

const year = document.querySelector('[data-year]')
if (year) year.textContent = String(new Date().getFullYear())

const lightbox = document.getElementById('lightbox')
const lightboxImage = document.getElementById('lightbox-image')
const lightboxClose = lightbox?.querySelector('.lightbox-close')
const lightboxImages = document.querySelectorAll('main img')

if (lightbox && lightboxImage && lightboxClose) {
  const openLightbox = (image) => {
    lightboxImage.src = image.currentSrc || image.src
    lightboxImage.alt = image.alt || ''
    lightbox.setAttribute('aria-label', image.alt || 'Screenshot')
    document.body.style.overflow = 'hidden'
    lightbox.showModal()
    lightboxClose.focus()
  }

  const closeLightbox = () => {
    if (lightbox.open) lightbox.close()
  }

  lightboxImages.forEach((image) => {
    image.classList.add('lightboxable')
    image.tabIndex = 0
    image.setAttribute('role', 'button')
    image.setAttribute('aria-label', `${image.alt || 'Screenshot'}: ${labels.enlarge}`)
    image.addEventListener('click', () => openLightbox(image))
    image.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      openLightbox(image)
    })
  })

  lightboxClose.addEventListener('click', closeLightbox)
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox()
  })
  lightbox.addEventListener('close', () => {
    lightboxImage.removeAttribute('src')
    document.body.style.overflow = ''
  })
  lightbox.addEventListener('cancel', () => {
    document.body.style.overflow = ''
  })
}
