const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = 'https://developers.google.com/oauthplayground';

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive']
});

console.log('\n======================================================');
console.log('🔗 GOOGLE DRIVE AUTHORIZATION:');
console.log('======================================================');
console.log('1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Sign in with your Google account and click "Allow/Continue".');
console.log('3. Copy the authorization code (starts with 4/...).');
console.log('4. Paste the authorization code below:');
console.log('======================================================\n');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Enter Authorization Code: ', async (code) => {
    rl.close();
    try {
        const { tokens } = await oauth2Client.getToken(code.trim());
        console.log('\n✅ NEW REFRESH TOKEN OBTAINED:');
        console.log(tokens.refresh_token);

        if (tokens.refresh_token) {
            const envPath = path.join(__dirname, '.env');
            let envContent = fs.readFileSync(envPath, 'utf8');
            if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
            } else {
                envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
            }
            fs.writeFileSync(envPath, envContent, 'utf8');
            console.log('\n🎉 Successfully updated backend/.env with fresh GOOGLE_REFRESH_TOKEN!');
        } else {
            console.log('⚠️ Note: No refresh token returned. Ensure access_type=offline.');
        }
    } catch (err) {
        console.error('❌ Error exchanging code for tokens:', err.message);
    }
});
