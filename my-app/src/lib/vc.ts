import { SignJWT, importJWK, JWK, jwtVerify } from 'jose';
import { randomUUID } from 'crypto';
import type { VerifiableCredential } from '../types/index';
import { getIssuerJwkJson } from '@/lib/envServer';
export interface CreateVcParams {
	issuerDid: string;
	verificationMethod: string;
	credential: Omit<VerifiableCredential, 'proof' | 'issuanceDate' | 'id' | '@context' | 'type' | 'issuer'> & {
		credentialSubject: VerifiableCredential['credentialSubject'];
	};
}

export async function getIssuerJwk(): Promise<JWK> {
	const jwkJson = getIssuerJwkJson();
	try {
		const jwk = JSON.parse(jwkJson);
		return jwk as JWK;
	} catch (error) {
		throw new Error(`Invalid VC_ISSUER_JWK format: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

export async function signCredential(params: CreateVcParams): Promise<VerifiableCredential> {
	const jwk = await getIssuerJwk();
	
	// Check if this is a development JWK with placeholder values
	const isDevelopmentJWK = jwk.n === 'placeholder-n-value-for-development';
	
	if (isDevelopmentJWK) {
		console.warn('⚠️  Using development JWK - VCs will not be cryptographically valid');
		// Return a mock VC for development
		const issuanceDate = new Date().toISOString();
		const vcId = `urn:uuid:${randomUUID()}`;

		const unsignedVc: VerifiableCredential = {
			'@context': [
				'https://www.w3.org/2018/credentials/v1',
				{ AchievementCredential: 'https://purl.imsglobal.org/pec/v1' },
			],
			type: ['VerifiableCredential', 'AchievementCredential'],
			issuer: params.issuerDid,
			issuanceDate,
			id: vcId,
			credentialSubject: params.credential.credentialSubject,
		};

		return {
			...unsignedVc,
			proof: {
				type: 'JsonWebSignature2020',
				created: issuanceDate,
				proofPurpose: 'assertionMethod',
				verificationMethod: params.verificationMethod,
				jws: 'development-mock-jws-token',
			},
		};
	}

	// Production VC signing
	const key = await importJWK(jwk, jwk.alg);

	const issuanceDate = new Date().toISOString();
	const vcId = `urn:uuid:${randomUUID()}`;

	const unsignedVc: VerifiableCredential = {
		'@context': [
			'https://www.w3.org/2018/credentials/v1',
			{ AchievementCredential: 'https://purl.imsglobal.org/pec/v1' },
		],
		type: ['VerifiableCredential', 'AchievementCredential'],
		issuer: params.issuerDid,
		issuanceDate,
		id: vcId,
		credentialSubject: params.credential.credentialSubject,
	};

	const jws = await new SignJWT({ vc: unsignedVc })
		.setProtectedHeader({ alg: jwk.alg as string, kid: jwk.kid })
		.setIssuer(params.issuerDid)
		.setIssuedAt()
		.sign(key);

	return {
		...unsignedVc,
		proof: {
			type: 'JsonWebSignature2020',
			created: issuanceDate,
			proofPurpose: 'assertionMethod',
			verificationMethod: params.verificationMethod,
			jws,
		},
	};
}

export async function verifyCredentialJws(jws: string, jwk: JWK) {
	const key = await importJWK(jwk, jwk.alg);
	return jwtVerify(jws, key);
}


