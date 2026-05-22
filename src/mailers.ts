import { Resend } from 'resend';

const resend = new Resend('re_PRZKzndt_2z3Q1YYxtho3DWfqRXZMX1Ub');

export async function sendInviteEmail_resend(email: string, inviteCode: string){
    console.log(`sending code ${inviteCode} to email ${email}`);
    const response = await resend.emails.send({
        from: 'bayareaeventpromoter@gmail.com',
        to: email,
        subject: 'Welcome to LocalBuzz!',
        html: `<p>Congrats on joining LocalBuzz! Your code is <strong>${inviteCode}</strong>!</p>`
    });
    console.log(`Email sent: ${JSON.stringify(response)}`);
}

export async function sendInviteEmail_gmail(email: string, code: string){
    console.log(`sending code ${code} to email ${email}`);
    const response = await resend.emails.send({
        from: 'bayareaeventpromoter@gmail.com',
        to: email,
        subject: 'Welcome to LocalBuzz!',
        html: `<p>Congrats on joining LocalBuzz! Your code is <strong>${code}</strong>!</p>`
    });
    console.log(`Email sent: ${JSON.stringify(response)}`);
}

export async function sendInviteEmail(email: string, code: string){
   const provider = process.env.EMAIL_PROVIDER;
   if(provider === "gmail"){
       await sendInviteEmail_gmail(email, code);
   }else if(provider === "resend"){
       await sendInviteEmail_resend(email, code);
   }else{
       console.error("No email provider found.");
   }
}
