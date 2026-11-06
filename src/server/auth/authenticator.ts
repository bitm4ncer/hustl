import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type { Authenticator } from './routes'

/**
 * Dünne Hülle um @simplewebauthn/server. Die Routen kennen nur das Interface,
 * damit sie mit einem Fake getestet werden können.
 */
export const simpleWebAuthn: Authenticator = {
  async registrationOptions({ rpId, userName }) {
    return generateRegistrationOptions({
      rpName: 'Hustl',
      rpID: rpId,
      userName,
      userDisplayName: userName,
      attestationType: 'none',
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'preferred',
      },
    })
  },

  async verifyRegistration({ response, challenge, origin, rpId }) {
    const result = await verifyRegistrationResponse({
      response: response as any,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: true,
    })
    if (!result.verified || !result.registrationInfo) {
      throw new Error('Registration not verified')
    }
    const credential = result.registrationInfo.credential
    return {
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
    }
  },

  async authenticationOptions({ rpId, credentialIds }) {
    return generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials: credentialIds.map((id) => ({ id })),
      userVerification: 'required',
    })
  },

  async verifyAuthentication({ response, challenge, origin, rpId, credential }) {
    const result = await verifyAuthenticationResponse({
      response: response as any,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      credential: {
        id: (response as { id: string }).id,
        publicKey: credential.publicKey,
        counter: credential.counter,
      } as any,
      requireUserVerification: true,
    })
    if (!result.verified) throw new Error('Authentication not verified')
    return { newCounter: result.authenticationInfo.newCounter }
  },
}
