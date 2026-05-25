import nodemailer from "nodemailer";
import { Mailer } from "./Mailer";

export class GmailMailer implements Mailer {
    private transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });
    }

    async send(
        to: string,
        subject: string,
        html: string
    ): Promise<void> {
        await this.transporter.sendMail({
            from: `"LocalBuzz" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            html
        });
    }
}
