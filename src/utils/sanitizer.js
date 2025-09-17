import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

/**
 * Comprehensive input sanitization and validation utilities
 * Provides protection against XSS, injection attacks, and data validation
 */

// HTML sanitization options
const sanitizeOptions = {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM_IMPORT: false
};

// Strict sanitization for user input
const strictSanitizeOptions = {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM_IMPORT: false,
  FORBID_TAGS: ['script', 'object', 'embed', 'link', 'style', 'meta', 'iframe'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
};

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param {string} input - Input string to sanitize
 * @param {boolean} strict - Use strict sanitization (default: true)
 * @returns {string} Sanitized string
 */
export const sanitizeHtml = (input, strict = true) => {
  if (typeof input !== 'string') return '';
  
  const options = strict ? strictSanitizeOptions : sanitizeOptions;
  return DOMPurify.sanitize(input, options);
};

/**
 * Sanitize plain text input
 * @param {string} input - Input string to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
export const sanitizeText = (input, maxLength = 1000) => {
  if (typeof input !== 'string') return '';
  
  // Remove HTML tags and dangerous characters
  let sanitized = input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"&]/g, '') // Remove dangerous characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
};

/**
 * Sanitize email address
 * @param {string} email - Email to sanitize
 * @returns {string} Sanitized email
 */
export const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return '';
  
  const sanitized = email.trim().toLowerCase();
  
  // Validate email format
  if (!validator.isEmail(sanitized)) {
    throw new Error('Invalid email format');
  }
  
  // Check for suspicious patterns
  if (sanitized.includes('..') || sanitized.startsWith('.') || sanitized.endsWith('.')) {
    throw new Error('Invalid email format');
  }
  
  return sanitized;
};

/**
 * Sanitize phone number
 * @param {string} phone - Phone number to sanitize
 * @returns {string} Sanitized phone number
 */
export const sanitizePhone = (phone) => {
  if (typeof phone !== 'string') return '';
  
  // Remove all non-digit characters except + at the beginning
  let sanitized = phone.replace(/[^\d+]/g, '');
  
  // Ensure + is only at the beginning
  if (sanitized.includes('+') && !sanitized.startsWith('+')) {
    sanitized = '+' + sanitized.replace(/\+/g, '');
  }
  
  // Validate length (7-15 digits is typical for international numbers)
  const digitsOnly = sanitized.replace(/\+/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    throw new Error('Invalid phone number length');
  }
  
  return sanitized;
};

/**
 * Sanitize company name
 * @param {string} company - Company name to sanitize
 * @returns {string} Sanitized company name
 */
export const sanitizeCompany = (company) => {
  if (typeof company !== 'string') return '';
  
  let sanitized = company
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"&]/g, '') // Remove dangerous characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Limit length
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }
  
  return sanitized;
};

/**
 * Sanitize country name
 * @param {string} country - Country name to sanitize
 * @returns {string} Sanitized country name
 */
export const sanitizeCountry = (country) => {
  if (typeof country !== 'string') return '';
  
  const allowedCountries = [
    'Turkey', 'United States', 'United Kingdom', 'Germany', 'France', 'Italy',
    'Spain', 'Canada', 'Australia', 'Japan', 'South Korea', 'China', 'India',
    'Brazil', 'Mexico', 'Netherlands', 'Switzerland', 'Sweden', 'Norway',
    'Denmark', 'Finland', 'Poland', 'Czech Republic', 'Austria', 'Belgium',
    'Portugal', 'Greece', 'Other'
  ];
  
  const sanitized = country.trim();
  
  if (!allowedCountries.includes(sanitized)) {
    throw new Error('Invalid country selection');
  }
  
  return sanitized;
};

/**
 * Sanitize contact reason
 * @param {string} reason - Contact reason to sanitize
 * @returns {string} Sanitized contact reason
 */
export const sanitizeContactReason = (reason) => {
  if (typeof reason !== 'string') return '';
  
  const allowedReasons = [
    'sales', 'complaint', 'follow-up', 'quality-warranty', 'financial'
  ];
  
  const sanitized = reason.trim();
  
  if (!allowedReasons.includes(sanitized)) {
    throw new Error('Invalid contact reason');
  }
  
  return sanitized;
};

/**
 * Sanitize product requirements
 * @param {Array} requirements - Product requirements array
 * @returns {Array} Sanitized requirements array
 */
export const sanitizeProductRequirements = (requirements) => {
  if (!Array.isArray(requirements)) {
    throw new Error('Requirements must be an array');
  }
  
  if (requirements.length === 0) {
    throw new Error('At least one product requirement is required');
  }
  
  if (requirements.length > 10) {
    throw new Error('Maximum 10 products allowed per inquiry');
  }
  
  const allowedLeadTimes = ['immediate', '1-2 weeks', '2-4 weeks', '1-2 months', '2+ months'];
  
  return requirements.map((req, index) => {
    if (typeof req !== 'object' || req === null) {
      throw new Error(`Invalid requirement at index ${index}`);
    }
    
    const sanitized = {
      id: sanitizeText(req.id || '', 50),
      productName: sanitizeText(req.productName || '', 200),
      partNumber: sanitizeText(req.partNumber || '', 100),
      quantity: Math.max(1, Math.min(1000, parseInt(req.quantity) || 1)),
      leadTime: req.leadTime && allowedLeadTimes.includes(req.leadTime) ? req.leadTime : '',
      isPreFilled: Boolean(req.isPreFilled)
    };
    
    // Validate required fields
    if (!sanitized.productName) {
      throw new Error(`Product name is required for item ${index + 1}`);
    }
    
    if (!sanitized.leadTime) {
      throw new Error(`Lead time is required for item ${index + 1}`);
    }
    
    return sanitized;
  });
};

/**
 * Sanitize product context
 * @param {Object} context - Product context object
 * @returns {Object} Sanitized product context
 */
export const sanitizeProductContext = (context) => {
  if (typeof context !== 'object' || context === null) {
    return null;
  }
  
  return {
    id: sanitizeText(context.id || '', 50),
    name: sanitizeText(context.name || '', 200),
    oemNumber: sanitizeText(context.oemNumber || '', 100),
    manufacturer: sanitizeText(context.manufacturer || '', 100),
    category: sanitizeText(context.category || '', 100),
    price: typeof context.price === 'number' ? Math.max(0, context.price) : null
  };
};

/**
 * Comprehensive form data sanitization
 * @param {Object} formData - Form data to sanitize
 * @returns {Object} Sanitized form data
 */
export const sanitizeContactForm = (formData) => {
  try {
    return {
      firstName: sanitizeText(formData.firstName || '', 50),
      lastName: sanitizeText(formData.lastName || '', 50),
      company: sanitizeCompany(formData.company || ''),
      country: sanitizeCountry(formData.country || ''),
      phone: sanitizePhone(formData.phone || ''),
      email: sanitizeEmail(formData.email || ''),
      contactReason: sanitizeContactReason(formData.contactReason || ''),
      message: sanitizeText(formData.message || '', 2000),
      requirements: formData.contactReason === 'sales' && formData.requirements 
        ? sanitizeProductRequirements(formData.requirements)
        : undefined,
      productContext: formData.productContext 
        ? sanitizeProductContext(formData.productContext)
        : undefined
    };
  } catch (error) {
    throw new Error(`Form validation failed: ${error.message}`);
  }
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result
 */
export const validatePasswordStrength = (password) => {
  if (typeof password !== 'string') {
    return { isValid: false, errors: ['Password must be a string'] };
  }
  
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  // Check for common weak patterns
  const commonPasswords = ['password', '123456', 'admin', 'qwerty', 'letmein'];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    errors.push('Password contains common weak patterns');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    strength: errors.length === 0 ? 'strong' : errors.length <= 2 ? 'medium' : 'weak'
  };
};

/**
 * Sanitize and validate user input for admin operations
 * @param {Object} userData - User data to sanitize
 * @returns {Object} Sanitized user data
 */
export const sanitizeUserData = (userData) => {
  return {
    name: sanitizeText(userData.name || '', 100),
    email: sanitizeEmail(userData.email || ''),
    role: ['USER', 'ADMIN', 'SUPER_ADMIN'].includes(userData.role) ? userData.role : 'USER',
    isActive: Boolean(userData.isActive)
  };
};

export default {
  sanitizeHtml,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
  sanitizeCompany,
  sanitizeCountry,
  sanitizeContactReason,
  sanitizeProductRequirements,
  sanitizeProductContext,
  sanitizeContactForm,
  validatePasswordStrength,
  sanitizeUserData
};
