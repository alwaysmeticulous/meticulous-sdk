export const sanitizeFilename: (filename: string) => string = (filename) => {
  return filename.replace(/[^a-zA-Z0-9]/g, "_");
};
