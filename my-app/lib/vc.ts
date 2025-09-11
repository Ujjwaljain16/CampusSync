import { SignJWT, importJWK, JWK, jwtVerify } from 'jose';
import { randomUUID } from 'crypto';
import type { VerifiableCredential } from '../src/types';

export interface CreateVcParams {
	issuerDid: string;
	verificationMethod: string;
	credential: Omit<VerifiableCredential, 'proof' | 'issuanceDate' | 'id' | '@context' | 'type' | 'issuer'> & {
		credentialSubject: VerifiableCredential['credentialSubject'];
	};
}

export async function getIssuerJwk(): Promise<JWK> {
	const jwkJson = process.env.VC_ISSUER_JWK;
	if (!jwkJson) throw new Error('VC_ISSUER_JWK is not set');
	const jwk = JSON.parse(jwkJson);
	return jwk as JWK;
}

export async function signCredential(params: CreateVcParams): Promise<VerifiableCredential> {
	const jwk = await getIssuerJwk();
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


