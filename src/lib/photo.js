// Sélectionne une image depuis l'appareil (input file, galerie ou appareil photo
// selon l'OS) et renvoie un dataURL JPEG compressé, léger pour le stockage local.
export function choisirPhoto({ maxSize = 256, quality = 0.72 } = {}) {
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.style.position = 'fixed'
      input.style.top = '-9999px'
      input.style.opacity = '0'
      input.onchange = () => {
        const file = input.files && input.files[0]
        try { document.body.removeChild(input) } catch (e) {}
        if (!file) return resolve(null)
        const reader = new FileReader()
        reader.onload = () => compresserImage(reader.result, maxSize, quality, resolve)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(file)
      }
      document.body.appendChild(input)
      input.click()
    } catch (e) {
      resolve(null)
    }
  })
}

function compresserImage(dataUrl, maxSize, quality, cb) {
  const img = new Image()
  img.onload = () => {
    let { width, height } = img
    if (width > height && width > maxSize) {
      height = Math.round((height * maxSize) / width)
      width = maxSize
    } else if (height >= width && height > maxSize) {
      width = Math.round((width * maxSize) / height)
      height = maxSize
    }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      cb(canvas.toDataURL('image/jpeg', quality))
    } catch (e) {
      cb(dataUrl)
    }
  }
  img.onerror = () => cb(dataUrl)
  img.src = dataUrl
}
