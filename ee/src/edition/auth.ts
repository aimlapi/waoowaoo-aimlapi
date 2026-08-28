import CredentialsProvider from 'next-auth/providers/credentials'
import {
  createGoogleOAuthProvider,
  readGoogleProfileImage,
  readVerifiedGoogleProfileEmail,
} from '@ee/auth/google-oauth'
import { authorizePasswordIdentity } from '@ee/auth/password-auth'
import { authorizePhoneIdentity } from '@ee/auth/phone-verification'
import { syncLinkedGoogleAccountImage } from '@/lib/auth/next-auth-adapter'
import { exchangeWechatOfficialAttempt } from '@ee/auth/wechat-official-attempt'
import { logAuthAction } from '@/lib/logging/semantic'
import type { EditionAuthContract } from '@/lib/edition/contracts/auth'
import { editionServer } from './server'

export const editionAuth = {
  createProviders() {
    const deploymentFeatures = editionServer.getDeploymentFeatures({
      edition: 'cloud',
      providerCredentialMode: editionServer.providerCredentials.defaultMode,
    })
    const passwordProvider = deploymentFeatures.enablePasswordAuth
      ? CredentialsProvider({
          id: 'credentials',
          name: 'password',
          credentials: {
            identity: { label: 'Identity', type: 'text' },
            password: { label: 'Password', type: 'password' },
            mode: { label: 'Mode', type: 'text' },
          },
          async authorize(credentials) {
            return await authorizePasswordIdentity({
              identity: credentials?.identity,
              password: credentials?.password,
              mode: credentials?.mode,
            })
          },
        })
      : null
    const phoneProvider = deploymentFeatures.enablePhoneAuth
      ? CredentialsProvider({
          id: 'phone',
          name: 'phone',
          credentials: {
            phoneNumber: { label: 'Phone number', type: 'tel' },
            code: { label: 'Verification code', type: 'text' },
          },
          async authorize(credentials) {
            return await authorizePhoneIdentity({
              phoneNumber: credentials?.phoneNumber,
              code: credentials?.code,
            })
          },
        })
      : null
    const wechatOfficialProvider = deploymentFeatures.showWechatOfficialAuth
      ? CredentialsProvider({
          id: 'wechat-official',
          name: 'wechat-official',
          credentials: {
            attemptId: { label: 'Attempt ID', type: 'text' },
            browserToken: { label: 'Browser token', type: 'password' },
          },
          async authorize(credentials) {
            return await exchangeWechatOfficialAttempt({
              attemptId: credentials?.attemptId,
              browserToken: credentials?.browserToken,
            })
          },
        })
      : null
    const googleOAuthProvider = createGoogleOAuthProvider(deploymentFeatures)

    return [
      ...(passwordProvider ? [passwordProvider] : []),
      ...(phoneProvider ? [phoneProvider] : []),
      ...(wechatOfficialProvider ? [wechatOfficialProvider] : []),
      ...(googleOAuthProvider ? [googleOAuthProvider] : []),
    ]
  },
  rateLimitedCredentialProviderIds: ['credentials', 'phone', 'wechat-official'],
  async signIn({ account, profile }) {
    if (account?.provider !== 'google') return true

    const verifiedEmail = readVerifiedGoogleProfileEmail(profile)
    if (!verifiedEmail) {
      logAuthAction('LOGIN', 'Google email not verified', { success: false, provider: 'google' })
      return false
    }

    logAuthAction('LOGIN', 'Google login succeeded', { success: true, provider: 'google' }, undefined, verifiedEmail)
    return true
  },
  async enrichJwt({ token, account, profile }) {
    if (account?.provider !== 'google') return
    const image = readGoogleProfileImage(profile)
    if (!image) return
    await syncLinkedGoogleAccountImage({
      providerAccountId: account.providerAccountId,
      image,
    })
    token.picture = image
  },
} satisfies EditionAuthContract
