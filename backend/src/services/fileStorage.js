const fs = require('fs/promises');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/avatars');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const ensureDir = async () => {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
};

const sanitizeFilename = (name) => {
  // Remove any characters that are not alphanumeric, dots, or dashes
  return name.replace(/[^a-zA-Z0-9.-]/g, '');
};

const saveAvatar = async (fileBuffer, originalName, userId) => {
  const ext = path.extname(originalName).toLowerCase();
  
  const extToMime = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  };
  const mimeType = extToMime[ext];

  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error('Tipo de archivo no permitido. Solo se permite JPG, PNG, WEBP.');
  }

  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error('El archivo excede el tamaño máximo permitido de 5MB.');
  }

  await ensureDir();

  const timestamp = Date.now();
  const safeUserId = sanitizeFilename(String(userId));
  // filename pattern: userId-timestamp.ext
  const filename = `${safeUserId}-${timestamp}${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);

  await fs.writeFile(filepath, fileBuffer);

  return {
    url: `/uploads/avatars/${filename}`,
    filename
  };
};

const deleteAvatar = async (filename) => {
  if (!filename) return;
  
  const safeFilename = sanitizeFilename(filename);
  const filepath = path.join(UPLOADS_DIR, safeFilename);

  try {
    await fs.unlink(filepath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
};

const getAvatarUrl = (filename) => {
  if (!filename) return null;
  const safeFilename = sanitizeFilename(filename);
  return `/uploads/avatars/${safeFilename}`;
};

module.exports = {
  saveAvatar,
  deleteAvatar,
  getAvatarUrl
};
