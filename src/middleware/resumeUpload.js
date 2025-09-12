import multer from 'multer';

// Configure storage: use memory to forward to S3-compatible storage
const storage = multer.memoryStorage();

// File filter for resumes
const fileFilter = (req, file, cb) => {
  // Allow only PDF, DOC, and DOCX files
  const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, DOC, and DOCX files are allowed for resumes!'), false);
  }
};

// Configure multer for resumes
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Single resume upload middleware
export const uploadResume = upload.single('resume');

// Error handling middleware for resume uploads
export const handleResumeUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'Resume file too large. Maximum size is 5MB.'
      });
    }
    return res.status(400).json({
      success: false,
      error: 'File upload error: ' + error.message
    });
  }
  
  if (error.message === 'Only PDF, DOC, and DOCX files are allowed for resumes!') {
    return res.status(400).json({
      success: false,
      error: 'Only PDF, DOC, and DOCX files are allowed for resumes!'
    });
  }
  
  next(error);
};

export default upload;
