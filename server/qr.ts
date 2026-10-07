import qrcode from 'qrcode-generator';

/** A QR code drawn with half-block characters (two modules per line), dark on light. */
export function terminalQr(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const margin = 2;
  const dark = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c);
  const lines: string[] = [];
  for (let r = -margin; r < n + margin; r += 2) {
    let line = '    ';
    for (let c = -margin; c < n + margin; c++) {
      const top = dark(r, c);
      const bottom = dark(r + 1, c);
      // Light modules are printed as "ink" so the code reads correctly on dark terminals.
      line += top && bottom ? ' ' : top ? '▄' : bottom ? '▀' : '█';
    }
    lines.push(line);
  }
  return lines.join('\n') + '\n';
}
