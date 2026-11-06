/**
 * Öffnet den System-Dateidialog und liefert die gewählte Datei.
 *
 * Browser und Electron teilen sich diesen Weg, weil beide ein `<input type="file">`
 * unterstützen. Wird der Dialog abgebrochen, bleibt das Promise offen — wie beim
 * nativen Dialog, der ohne Auswahl einfach nichts zurückgibt.
 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null)
      input.remove()
    })
    input.addEventListener('cancel', () => {
      resolve(null)
      input.remove()
    })
    document.body.appendChild(input)
    input.click()
  })
}
