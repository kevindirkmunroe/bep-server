import { Resend } from "resend";
import { Mailer } from "./Mailer";

export class ResendMailer implements Mailer {

    private resend: Resend;

    constructor() {
        console.log(`👉🏻Configuring Resend as mailer in PRODUCTION environment...`);
        this.resend = new Resend(process.env.RESEND_API_KEY);
        console.log(`...OK`);

    }

    async send(
        to: string,
        subject: string,
        html: string
    ): Promise<void> {

        const { error } = await this.resend.emails.send({
            from: "Airhorn.events <notifications@airhorn.events>",
            to,
            subject,
            html
        });

        if (error) {
            throw new Error(`Resend failed: ${error.message}`);
        }
    }
}
