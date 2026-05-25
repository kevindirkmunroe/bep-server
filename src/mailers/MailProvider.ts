import { Mailer } from "./Mailer";
import { GmailMailer } from "./GmailMailer";
import { ResendMailer } from "./ResendMailer";

export class MailProvider {
    private static mailer: Mailer;

    static getMailer(): Mailer {
        if (!this.mailer) {
            this.mailer = this.createMailer();
        }

        return this.mailer;
    }

    private static createMailer(): Mailer {
        if (
            process.env.GMAIL_USER &&
            process.env.GMAIL_APP_PASSWORD
        ) {
            console.log("Using Gmail mailer");
            return new GmailMailer();
        }

        if (process.env.RESEND_API_KEY) {
            console.log("Using Resend mailer");
            return new ResendMailer();
        }

        throw new Error(
            "No mail provider configured"
        );
    }
}
