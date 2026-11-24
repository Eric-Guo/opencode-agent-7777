export function downloadFile(filename: string, blob: Blob) {
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  try {
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}
