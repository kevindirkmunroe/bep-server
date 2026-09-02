import nodemailer from "nodemailer";
import { Mailer } from "./Mailer";

export class MailpitMailer implements Mailer {

    constructor(){
        console.log(`👉🏻Configuring MailpitMailer as mailer in DEV environment.`);
    }

    private transporter = nodemailer.createTransport({
        host: "localhost",
        port: 1025,
        secure: false
    });

    async send(
        to: string,
        subject: string,
        html: string
    ): Promise<void> {

        await this.transporter.sendMail({
            from: "Airhorn.events <notifications@airhorn.events>",
            to,
            subject,
            html
        });
    }
}
