// Backslash is the LIKE escape character (every query declares it with ESCAPE '\'),
// so escaping it plus % and _ makes the user's text match literally.
export function escapeLike(value) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
