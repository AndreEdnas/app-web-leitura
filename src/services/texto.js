const MOJIBAKE_PT = [
  ["\u00C3\u00A1", "á"],
  ["\u00C3\u00A0", "à"],
  ["\u00C3\u00A2", "â"],
  ["\u00C3\u00A3", "ã"],
  ["\u00C3\u00AA", "ê"],
  ["\u00C3\u00A9", "é"],
  ["\u00C3\u00AD", "í"],
  ["\u00C3\u00B3", "ó"],
  ["\u00C3\u00B5", "õ"],
  ["\u00C3\u00BA", "ú"],
  ["\u00C3\u00A7", "ç"],
  ["\u00C3\u0081", "Á"],
  ["\u00C3\u0080", "À"],
  ["\u00C3\u0082", "Â"],
  ["\u00C3\u0083", "Ã"],
  ["\u00C3\u0089", "É"],
  ["\u00C3\u008A", "Ê"],
  ["\u00C3\u008D", "Í"],
  ["\u00C3\u0093", "Ó"],
  ["\u00C3\u0095", "Õ"],
  ["\u00C3\u009A", "Ú"],
  ["\u00C3\u0087", "Ç"],
  ["\u00C2\u00BA", "º"],
  ["\u00C2\u00AA", "ª"],
  ["\u00E2\u20AC\u201C", "-"],
  ["\u00E2\u20AC\u201D", "-"],
  ["\u00E2\u20AC\u00A6", "..."],
  ["\u00E2\u20AC\u02DC", "'"],
  ["\u00E2\u20AC\u2122", "'"],
  ["\u00E2\u20AC\u0153", "\""],
  ["\u00E2\u20AC\u009D", "\""]
];

export function normalizarTextoPt(valor) {
  if (valor === null || valor === undefined) return "";

  return MOJIBAKE_PT.reduce(
    (texto, [errado, certo]) => texto.replaceAll(errado, certo),
    String(valor)
  );
}
