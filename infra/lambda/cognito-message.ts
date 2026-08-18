/**
 * The emails Cognito sends, written by us.
 *
 * Two problems with the default, and this fixes one and a half of them.
 *
 * The wording: Cognito's stock message is "Your confirmation code is 123456",
 * from nobody, about nothing. It names no product, so a recipient can't tell
 * what they're confirming — and neither can a spam filter, to which an
 * unattributed six-digit code from a shared sender is close to the archetype
 * of a phish. Worse, the pool's single `VerificationMessageTemplate` is used
 * for sign-up *and* for password resets, so any wording that fits both is
 * necessarily vague. A CustomMessage trigger is the only place Cognito lets
 * those be told apart (`triggerSource`), which is the whole reason this exists
 * rather than a template in the stack.
 *
 * The sender: that is a deliverability problem rather than a wording one, and
 * it's fixed in `stack.ts` by sending through SES on a domain we own and sign.
 *
 * Failure is the important case. A throw here fails the *sign-up*, not just
 * the email — so everything is wrapped, and anything unrecognized or unhandled
 * returns the event untouched, which leaves Cognito to send its own default.
 * A plain-looking email beats an account that can't be created.
 */

/** Only the fields used here; typing the whole event would mean a dependency
 *  on @types/aws-lambda for one handler. */
interface CustomMessageEvent {
  triggerSource: string;
  request: {
    codeParameter: string;
    usernameParameter?: string;
    userAttributes: Record<string, string>;
  };
  response: {
    smsMessage?: string | null;
    emailMessage?: string | null;
    emailSubject?: string | null;
  };
}

const APP = 'Statcast Sicko';
const SITE = process.env.SITE_URL ?? 'https://statcastsicko.com';

/** What the code is for, per trigger. `code` is Cognito's `{####}` placeholder,
 *  which must survive into the body or the email goes out without a code. */
interface Copy {
  subject: string;
  heading: string;
  /** The sentence above the code. */
  lead: string;
  /** The sentence below it. */
  footer: string;
}

function copyFor(source: string): Copy | null {
  switch (source) {
    case 'CustomMessage_SignUp':
    case 'CustomMessage_ResendCode':
      return {
        subject: `Confirm your email for ${APP}`,
        heading: 'Confirm your email',
        lead: `Enter this code on ${APP} to finish creating your account. It expires in 24 hours.`,
        footer: `If you didn't sign up for ${APP}, you can ignore this email — no account will be created.`,
      };
    case 'CustomMessage_ForgotPassword':
      return {
        subject: `Reset your ${APP} password`,
        heading: 'Reset your password',
        lead: `Enter this code on ${APP} to choose a new password. It expires in an hour.`,
        footer: `If you didn't ask to reset your password, you can ignore this email — your current password still works.`,
      };
    case 'CustomMessage_UpdateUserAttribute':
    case 'CustomMessage_VerifyUserAttribute':
      return {
        subject: `Verify your new email for ${APP}`,
        heading: 'Verify your email',
        lead: `Enter this code on ${APP} to confirm your new email address.`,
        footer: `If you didn't change your email, you can ignore this message.`,
      };
    default:
      // Admin invitations and the MFA/authentication messages aren't reachable
      // in this pool (self-signup, no MFA, no admin-created users). If one ever
      // becomes reachable, Cognito's own default is a better answer than a
      // message written for a different purpose.
      return null;
  }
}

/**
 * The email body.
 *
 * Inline styles and a table-free single column: every mail client mangles
 * something, and there is nothing here worth risking on a stylesheet. No
 * images either — a remote image blocked by default leaves a broken frame
 * above the one thing the reader came for, and hurts more than it helps with
 * filters. Colors are the app's own, but light-background: a mail client's
 * dark mode inverts what it likes, and a dark card is the thing it most often
 * gets wrong.
 */
function html(copy: Copy, code: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b2430;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #dfe4ea;border-radius:14px;padding:28px 26px;">
    <p style="margin:0 0 18px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0b7285;">${APP}</p>
    <h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;">${copy.heading}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#48525f;">${copy.lead}</p>
    <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:0.18em;text-align:center;padding:16px 0;background:#f4f6f8;border-radius:10px;">${code}</p>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#6b7684;">${copy.footer}</p>
    <p style="margin:18px 0 0;font-size:13px;color:#6b7684;">— ${APP}, <a href="${SITE}" style="color:#0b7285;">${SITE.replace(/^https?:\/\//, '')}</a></p>
  </div>
</body></html>`;
}

export const handler = async (event: CustomMessageEvent): Promise<CustomMessageEvent> => {
  try {
    const copy = copyFor(event.triggerSource);
    if (!copy) return event;
    const code = event.request.codeParameter;
    // Built whole, then assigned in one go. Writing the fields as they are
    // computed means a throw halfway through leaves a subject with no body —
    // a torn response Cognito has to reject, where an untouched one just gets
    // the default treatment.
    const response = {
      emailSubject: copy.subject,
      emailMessage: html(copy, code),
      // SMS is off in this pool (email-only sign-in and recovery), but Cognito
      // reads the field regardless of whether it will ever send one.
      smsMessage: `${copy.heading}: ${code} — ${APP}`,
    };
    Object.assign(event.response, response);
  } catch (err) {
    console.error('custom message failed, falling back to the default:', err);
  }
  return event;
};
