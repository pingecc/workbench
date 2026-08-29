export function cleanLogText(text: string): string {
  return text
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B[()][0-9A-Za-z]/g, '')
    .replace(/\u001B[@-Z\\-_]/g, '')
    .replace(/\r/g, '')
}
