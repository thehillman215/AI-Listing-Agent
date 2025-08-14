import multer from "multer";
const maxFiles = Number(process.env.VISION_MAX_IMAGES || 10);
const storage = multer.memoryStorage();
function fileFilter(req, file, cb) {
  if (!/^image\/(jpeg|png)$/.test(file.mimetype)) return cb(new Error("Only JPG/PNG allowed"));
  cb(null, true);
}
export const photosUpload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024, files: maxFiles },
  fileFilter
}).array("images", maxFiles);
