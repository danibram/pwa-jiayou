/**
 * Abre el diccionario Pleco con el carácter especificado
 * @param character - Carácter chino a buscar en Pleco
 */
export const openInPleco = (character: string): void => {
  const cleanChar = character.trim();
  const url = `plecoapi://x-callback-url/s?q=${encodeURIComponent(cleanChar)}`;

  try {
    window.open(url, '_blank');
  } catch {
    // The browser blocked the custom protocol. The link is best-effort.
  }
};

/**
 * Verifica si la URL de Pleco es válida
 * @param character - Carácter a verificar
 * @returns true si el carácter no está vacío
 */
export const isValidForPleco = (character: unknown): boolean =>
  typeof character === 'string' && character.trim().length > 0;
