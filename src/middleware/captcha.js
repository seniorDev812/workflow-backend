// Using native fetch (Node.js 18+)

// Optional CAPTCHA verification middleware
// Supports Google reCAPTCHA v2/v3 or Cloudflare Turnstile style endpoints via env config
// Set CAPTCHA_PROVIDER=recaptcha or turnstile to enable. Otherwise, middleware is a no-op.

const provider = (process.env.CAPTCHA_PROVIDER || '').toLowerCase();
const secret = process.env.CAPTCHA_SECRET_KEY || '';
const threshold = parseFloat(process.env.CAPTCHA_MIN_SCORE || '0.5'); // for v3

const verifyWithRecaptcha = async (token, remoteip) => {
  const params = new URLSearchParams();
  params.append('secret', secret);
  params.append('response', token);
  if (remoteip) params.append('remoteip', remoteip);

  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  return res.json();
};

const verifyWithTurnstile = async (token, remoteip) => {
  const params = new URLSearchParams();
  params.append('secret', secret);
  params.append('response', token);
  if (remoteip) params.append('remoteip', remoteip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  return res.json();
};

export const optionalCaptcha = async (req, res, next) => {
  try {
    // No CAPTCHA configured → skip
    if (!provider || !secret) {
      return next();
    }

    // Token may arrive in body.captchaToken or body['g-recaptcha-response']
    const token = req.body?.captchaToken || req.body?.['g-recaptcha-response'];
    if (!token) {
      return res.status(400).json({ success: false, error: 'Captcha token is required.' });
    }

    const remoteip = req.ip;

    let result;
    if (provider === 'recaptcha') {
      result = await verifyWithRecaptcha(token, remoteip);
      if (!result.success) {
        return res.status(400).json({ success: false, error: 'Captcha verification failed.' });
      }
      // If score exists, enforce threshold for reCAPTCHA v3
      if (typeof result.score === 'number' && result.score < threshold) {
        return res.status(400).json({ success: false, error: 'Captcha score too low.' });
      }
    } else if (provider === 'turnstile') {
      result = await verifyWithTurnstile(token, remoteip);
      if (!result.success) {
        return res.status(400).json({ success: false, error: 'Captcha verification failed.' });
      }
    } else {
      // Unknown provider → skip to avoid blocking; log in server logs ideally
      return next();
    }

    return next();
  } catch (err) {
    return res.status(400).json({ success: false, error: 'Captcha verification error.' });
  }
};


