import { Mailer } from "./Mailer";
import { GmailMailer } from "./GmailMailer";
import { ResendMailer } from "./ResendMailer";
import {MailpitMailer} from "./MailpitMailer";

export class MailProvider {
    private static mailer: Mailer;

    static getMailer(): Mailer {
        if (!this.mailer) {
            this.mailer = this.createMailer();
        }

        return this.mailer;
    }

    private static createMailer(): Mailer {

        const mailer: Mailer =
            process.env.NODE_ENV === "production" && process.env.RESEND_API_KEY
                ? new ResendMailer()
                : new MailpitMailer();

        if(mailer) {
            return mailer;
        }

        throw new Error(
            "No mail provider configured"
        );
    }
}
