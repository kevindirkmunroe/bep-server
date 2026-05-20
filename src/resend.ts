import { Resend } from 'resend';

const resend = new Resend('re_PRZKzndt_2z3Q1YYxtho3DWfqRXZMX1Ub');

export async function sendInviteEmail(email: string, code: string){

    console.log(`sending code ${code} to email ${email}`);
    const response = await resend.emails.send({
        from: 'bayareaeventpromoter@gmail.com',
        to: email,
        subject: 'Welcome to LocalBuzz!',
        html: `<p>Congrats on joining LocalBuzz! Your code is <strong>${code}</strong>!</p>`
    });
    console.log(`Email sent: ${JSON.stringify(response)}`);
}
