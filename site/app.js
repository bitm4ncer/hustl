const header = document.querySelector('.site-header')
const menuButton = document.querySelector('.menu-btn')
const nav = document.getElementById('main-nav')

if (header) {
  const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 8)
  updateHeader()
  window.addEventListener('scroll', updateHeader, { passive: true })
}

if (menuButton && nav) {
  const closeNav = () => {
    nav.classList.remove('open')
    menuButton.setAttribute('aria-expanded', 'false')
    menuButton.setAttribute('aria-label', 'Menü öffnen')
  }

  menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('open')
    menuButton.setAttribute('aria-expanded', String(open))
    menuButton.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen')
  })

  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNav))

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNav()
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
      copyButton.textContent = 'Kopiert'
    } catch {
      copyButton.textContent = 'Bitte manuell kopieren'
    }
    window.setTimeout(() => {
      copyButton.textContent = original
    }, 2200)
  })
}

const year = document.querySelector('[data-year]')
if (year) year.textContent = String(new Date().getFullYear())
