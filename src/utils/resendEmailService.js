import { Resend } from 'resend';
import { logger } from './logger.js';

// Initialize Resend lazily
let resend = null;

const getResend = () => {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }
    resend = new Resend(apiKey);
  }
  return resend;
};

// Email configuration
const getEmailConfig = () => ({
  companyName: process.env.COMPANY_NAME || 'Seen Group',
  contactEmail: process.env.CONTACT_EMAIL || 'zakharovmaksym00@gmail.com',
  adminEmail: process.env.ADMIN_EMAIL || 'zakharovmaksym00@gmail.com',
  frontendUrl: process.env.FRONTEND_URL || 'https://workflow-seengroup.vercel.app/'
});

// Email templates
const emailTemplates = {
  // User confirmation email template
  userConfirmation: (applicationData) => {
    const { name, email, jobTitle, applicationId } = applicationData;
    const config = getEmailConfig();
    
    return {
      subject: `Application Confirmation - ${jobTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Application Received!</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Thank you for your interest in joining our team</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hello ${name},</h2>
            
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              We have successfully received your application for the <strong>${jobTitle}</strong> position. 
              Your application ID is: <code style="background: #e9ecef; padding: 2px 6px; border-radius: 4px;">${applicationId}</code>
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
              <h3 style="color: #333; margin-top: 0;">What happens next?</h3>
              <ul style="color: #666; line-height: 1.8;">
                <li>Our HR team will review your application within 2-3 business days</li>
                <li>If selected, we'll contact you to schedule an interview</li>
                <li>You'll receive updates on your application status via email</li>
              </ul>
            </div>
            
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              If you have any questions about your application, please don't hesitate to contact us.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="mailto:${config.contactEmail}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Contact Us
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
            
            <p style="color: #999; font-size: 14px; text-align: center; margin: 0;">
              Best regards,<br>
              <strong>${config.companyName} HR Team</strong><br>
              <a href="mailto:${config.contactEmail}" style="color: #667eea;">${config.contactEmail}</a>
            </p>
          </div>
        </div>
      `,
      text: `
        Application Confirmation - ${jobTitle}
        
        Hello ${name},
        
        We have successfully received your application for the ${jobTitle} position.
        Your application ID is: ${applicationId}
        
        What happens next?
        - Our HR team will review your application within 2-3 business days
        - If selected, we'll contact you to schedule an interview
        - You'll receive updates on your application status via email
        
        If you have any questions about your application, please contact us at ${config.contactEmail}
        
        Best regards,
        ${config.companyName} HR Team
      `
    };
  },

  // Admin notification email template
  adminNotification: (applicationData) => {
    const { name, email, phone, jobTitle, applicationId, resumeUrl, coverLetter } = applicationData;
    const config = getEmailConfig();
    
    return {
      subject: `New Job Application: ${jobTitle} - ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #dc3545; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Job Application</h1>
            <p style="color: white; margin: 10px 0 0 0;">Action Required</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Application Details</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333; width: 120px;">Name:</td>
                  <td style="padding: 8px 0; color: #666;">${name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Email:</td>
                  <td style="padding: 8px 0; color: #666;"><a href="mailto:${email}" style="color: #667eea;">${email}</a></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Phone:</td>
                  <td style="padding: 8px 0; color: #666;">${phone || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Position:</td>
                  <td style="padding: 8px 0; color: #666;">${jobTitle}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Application ID:</td>
                  <td style="padding: 8px 0; color: #666; font-family: monospace;">${applicationId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Resume:</td>
                  <td style="padding: 8px 0; color: #666;">
                    ${resumeUrl ? `<a href="${resumeUrl}" style="color: #667eea;">Download Resume</a>` : 'No resume uploaded'}
                  </td>
                </tr>
              </table>
            </div>
            
            ${coverLetter ? `
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Cover Letter</h3>
                <p style="color: #666; line-height: 1.6; white-space: pre-wrap;">${coverLetter}</p>
              </div>
            ` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${config.frontendUrl}/admin/career" 
                 style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-right: 10px;">
                View in Admin Panel
              </a>
              <a href="mailto:${email}" 
                 style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Reply to Applicant
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
            
            <p style="color: #999; font-size: 14px; text-align: center; margin: 0;">
              This is an automated notification from your career portal.
            </p>
          </div>
        </div>
      `,
      text: `
        New Job Application: ${jobTitle} - ${name}
        
        Application Details:
        - Name: ${name}
        - Email: ${email}
        - Phone: ${phone || 'Not provided'}
        - Position: ${jobTitle}
        - Application ID: ${applicationId}
        - Resume: ${resumeUrl ? 'Available for download' : 'No resume uploaded'}
        
        ${coverLetter ? `Cover Letter:\n${coverLetter}\n` : ''}
        
        View in Admin Panel: ${config.frontendUrl}/admin/career
        Reply to Applicant: ${email}
      `
    };
  }
};

// Send email function
export const sendEmail = async (to, subject, html, text) => {
  // Input validation
  if (!to || !subject || !html || !text) {
    logger.error('Missing required email parameters');
    return { success: false, error: 'Missing required email parameters' };
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    logger.error('Invalid email address:', to);
    return { success: false, error: 'Invalid email address' };
  }

  try {
    const resendClient = getResend();

    // Use verified domain for development, or configured domain for production
    const fromEmail = process.env.NODE_ENV === 'development' 
      ? 'onboarding@resend.dev'  // Always use verified domain in development
      : (process.env.FROM_EMAIL || 'onboarding@resend.dev');  // Use configured email in production
    
    const { data, error } = await resendClient.emails.send({
      from: `${process.env.COMPANY_NAME || 'Seen Group'} <${fromEmail}>`,
      to: [to],
      subject: subject,
      html: html,
      text: text
    });

    if (error) {
      logger.error('Resend email error:', error);
      
      // Handle Resend domain verification error gracefully
      if (error.message && (error.message.includes('verify a domain') || error.message.includes('domain is not verified'))) {
        return { 
          success: false, 
          error: `Email service requires domain verification. Please verify your domain (${fromEmail.split('@')[1]}) in Resend dashboard at https://resend.com/domains`,
          code: 'DOMAIN_VERIFICATION_REQUIRED'
        };
      }
      
      return { success: false, error: error.message };
    }

    logger.info(`Email sent successfully to ${to}:`, data);
    return { success: true, data };
  } catch (error) {
    logger.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

// Send application confirmation email
export const sendApplicationConfirmation = async (applicationData) => {
  // Validate required data
  if (!applicationData || !applicationData.email || !applicationData.name || !applicationData.jobTitle) {
    logger.error('Missing required application data for confirmation email');
    return { success: false, error: 'Missing required application data' };
  }

  const template = emailTemplates.userConfirmation(applicationData);
  
  // Handle Resend restrictions: in development, send to verified email if not the account owner
  // In production, send to actual applicant email
  const recipientEmail = process.env.NODE_ENV === 'development' 
    ? (applicationData.email === 'zakharovmaksym00@gmail.com' ? applicationData.email : 'zakharovmaksym00@gmail.com')
    : applicationData.email;
  
  // Add test prefix only in development
  const subject = process.env.NODE_ENV === 'development' 
    ? `[TEST] ${template.subject}`
    : template.subject;
  
  // Modify content only in development when redirecting emails
  let html = template.html;
  let text = template.text;
  
  if (process.env.NODE_ENV === 'development' && recipientEmail !== applicationData.email) {
    html = html.replace('Hello ' + applicationData.name, `Hello ${applicationData.name} (Original: ${applicationData.email})`);
    text = text.replace('Hello ' + applicationData.name, `Hello ${applicationData.name} (Original: ${applicationData.email})`);
  }
  
  return await sendEmail(recipientEmail, subject, html, text);
};

// Send admin notification email
export const sendAdminNotification = async (applicationData) => {
  // Validate required data
  if (!applicationData || !applicationData.name || !applicationData.email || !applicationData.jobTitle) {
    logger.error('Missing required application data for admin notification');
    return { success: false, error: 'Missing required application data' };
  }

  // Check if admin email is configured
  if (!process.env.ADMIN_EMAIL) {
    logger.error('Admin email not configured');
    return { success: false, error: 'Admin email not configured' };
  }

  const template = emailTemplates.adminNotification(applicationData);
  
  // Handle Resend restrictions: in development, send to verified email if admin email is not verified
  // In production, send to admin email
  const recipientEmail = process.env.NODE_ENV === 'development' 
    ? (process.env.ADMIN_EMAIL === 'zakharovmaksym00@gmail.com' ? process.env.ADMIN_EMAIL : 'zakharovmaksym00@gmail.com')
    : process.env.ADMIN_EMAIL;
  
  // Add admin prefix only in development
  const subject = process.env.NODE_ENV === 'development' 
    ? `[ADMIN] ${template.subject}`
    : template.subject;
  
  return await sendEmail(recipientEmail, subject, template.html, template.text);
};

