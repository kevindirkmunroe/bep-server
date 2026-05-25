import { Resend } from "resend";
import { Mailer } from "./Mailer";

export class ResendMailer implements Mailer {
    private resend: Resend;

    constructor() {
        this.resend = new Resend(
            process.env.RESEND_API_KEY
        );
    }

    async send(
        to: string,
        subject: string,
        html: string
    ): Promise<void> {
        await this.resend.emails.send({
            from: process.env.RESEND_FROM!,
            to,
            subject,
            html
        });
    }
}
