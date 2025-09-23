# 🔐 Verifiable Credentials (VC) Setup Guide

This guide helps you set up Verifiable Credentials issuance in CampusSync.

## 🚀 Quick Setup (Development)

### 1. Generate Development JWK

```bash
node scripts/generate-vc-jwk-simple.js
```

### 2. Add Environment Variables to `.env.local`

Copy the output from the script and add these variables to your `.env.local` file:

```env
# VC Issuer Configuration
VC_ISSUER_JWK={"kty":"RSA","use":"sig","kid":"key-749fe684","alg":"RS256","n":"placeholder-n-value-for-development","e":"AQAB","d":"placeholder-d-value-for-development","p":"placeholder-p-value-for-development","q":"placeholder-q-value-for-development","dp":"placeholder-dp-value-for-development","dq":"placeholder-dq-value-for-development","qi":"placeholder-qi-value-for-development"}

# DID Configuration
NEXT_PUBLIC_ISSUER_DID=did:web:localhost:3000
NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:localhost:3000#key-749fe684
```

### 3. Test VC Issuance

```bash
node test-vc-issuance.js
```

## 🏗️ How It Works

### Development Mode
- Uses placeholder JWK values
- Generates mock VCs for testing
- No cryptographic validation
- Perfect for development and testing

### Production Mode
- Requires real RSA key pair
- Generates cryptographically valid VCs
- Full JWT signing and verification
- Ready for production deployment

## 🔧 VC Features

### ✅ What's Working
- **Certificate Approval** → Automatic VC issuance
- **Batch Approval** → Multiple VCs at once
- **Development Mode** → Mock VCs for testing
- **Error Handling** → Graceful failure handling
- **Database Storage** → VCs stored in `verifiable_credentials` table

### 📋 VC Structure
```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    {"AchievementCredential": "https://purl.imsglobal.org/pec/v1"}
  ],
  "type": ["VerifiableCredential", "AchievementCredential"],
  "issuer": "did:web:localhost:3000",
  "issuanceDate": "2024-01-01T00:00:00.000Z",
  "id": "urn:uuid:...",
  "credentialSubject": {
    "id": "user-id",
    "certificateId": "cert-id",
    "title": "Certificate Title",
    "institution": "Institution Name",
    "dateIssued": "2024-01-01",
    "description": "Certificate Description"
  },
  "proof": {
    "type": "JsonWebSignature2020",
    "created": "2024-01-01T00:00:00.000Z",
    "proofPurpose": "assertionMethod",
    "verificationMethod": "did:web:localhost:3000#key-749fe684",
    "jws": "development-mock-jws-token"
  }
}
```

## 🚨 Troubleshooting

### Error: "VC_ISSUER_JWK is not set"
**Solution:** Run the JWK generation script and add the output to `.env.local`

### Error: "Invalid VC_ISSUER_JWK format"
**Solution:** Check that the JWK is valid JSON and properly formatted

### Error: "Failed to issue VC"
**Solution:** Check that all required environment variables are set

## 🔒 Security Notes

### Development
- Uses placeholder keys (not secure)
- VCs are not cryptographically valid
- Perfect for testing and development

### Production
- Generate real RSA key pairs
- Store keys securely (HSM, key vault)
- Use proper key rotation
- Implement key management policies

## 📚 Next Steps

1. **Test the setup** with the provided test script
2. **Approve certificates** from the faculty dashboard
3. **Check VC storage** in the database
4. **Verify VC structure** matches expected format
5. **Plan production key management** for deployment

## 🎯 API Endpoints

- `POST /api/certificates/issue` - Issue a single VC
- `POST /api/certificates/batch-approve` - Batch approve with VC issuance
- `POST /api/certificates/approve` - Single approve with VC issuance

All endpoints handle VC issuance automatically when certificates are approved!
