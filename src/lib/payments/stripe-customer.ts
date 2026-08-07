import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getPrismaErrorCode } from '@/lib/prisma-error'

const STRIPE_CUSTOMER_RECOVERY_AFTER_MS = 24 * 60 * 60 * 1_000
const STRIPE_CUSTOMER_USER_METADATA_KEY = 'wao_user_id'
const STRIPE_CUSTOMER_LINK_METADATA_KEY = 'wao_customer_link_id'

type StripeCustomerContact = {
  readonly name: string
  readonly email: string | null
  readonly phone: string | null
}

type StripeCustomerLinkView = {
  readonly id: string
  readonly userId: string
  readonly stripeCustomerId: string | null
  readonly createdAt: Date
  readonly user: {
    readonly id: string
    readonly name: string
    readonly email: string | null
    readonly accounts: ReadonlyArray<{
      readonly providerAccountId: string
    }>
  }
}

export type ResolvedStripeCustomer = {
  readonly stripeCustomerId: string
}

function contactFromLink(link: StripeCustomerLinkView): StripeCustomerContact {
  if (link.user.id !== link.userId) throw new Error('STRIPE_CUSTOMER_USER_SCOPE_DIVERGED')
  if (link.user.accounts.length > 1) throw new Error('STRIPE_CUSTOMER_PHONE_IDENTITY_CONFLICT')

  const phone = link.user.accounts[0]?.providerAccountId.trim() || null
  const email = link.user.email?.trim().toLowerCase() || null
  return {
    // The Stripe payment list renders Customer.name. Phone-only accounts use
    // their full canonical E.164 identity as explicitly required by operators.
    name: phone ?? email ?? link.user.name,
    email,
    phone,
  }
}

function customerMetadata(link: StripeCustomerLinkView): Stripe.MetadataParam {
  return {
    [STRIPE_CUSTOMER_USER_METADATA_KEY]: link.userId,
    [STRIPE_CUSTOMER_LINK_METADATA_KEY]: link.id,
  }
}

function customerCreateParams(
  link: StripeCustomerLinkView,
  contact: StripeCustomerContact,
): Stripe.CustomerCreateParams {
  return {
    name: contact.name,
    ...(contact.email ? { email: contact.email } : {}),
    ...(contact.phone ? { phone: contact.phone } : {}),
    metadata: customerMetadata(link),
  }
}

function contactFingerprint(contact: StripeCustomerContact): string {
  return createHash('sha256')
    .update(JSON.stringify(contact))
    .digest('hex')
}

function assertCustomerOwnedByLink(
  customer: Stripe.Customer,
  link: StripeCustomerLinkView,
): void {
  const linkedUserId = customer.metadata[STRIPE_CUSTOMER_USER_METADATA_KEY]
  const linkedRowId = customer.metadata[STRIPE_CUSTOMER_LINK_METADATA_KEY]
  if (linkedUserId && linkedUserId !== link.userId) {
    throw new Error('STRIPE_CUSTOMER_USER_IDENTITY_CONFLICT')
  }
  if (linkedRowId && linkedRowId !== link.id) {
    throw new Error('STRIPE_CUSTOMER_LINK_IDENTITY_CONFLICT')
  }
}

async function bindStripeCustomer(
  link: StripeCustomerLinkView,
  stripeCustomerId: string,
): Promise<void> {
  try {
    const claimed = await prisma.stripeCustomer.updateMany({
      where: {
        id: link.id,
        userId: link.userId,
        stripeCustomerId: null,
      },
      data: { stripeCustomerId },
    })
    if (claimed.count === 1) return
  } catch (error) {
    if (getPrismaErrorCode(error) === 'P2002') {
      throw new Error('STRIPE_CUSTOMER_BINDING_CONFLICT', { cause: error })
    }
    throw error
  }

  const current = await prisma.stripeCustomer.findUnique({
    where: { id: link.id },
    select: { userId: true, stripeCustomerId: true },
  })
  if (current?.userId === link.userId && current.stripeCustomerId === stripeCustomerId) return
  throw new Error('STRIPE_CUSTOMER_BINDING_CONFLICT')
}

async function synchronizeStripeCustomer(
  stripe: Stripe,
  link: StripeCustomerLinkView,
  customer: Stripe.Customer,
  contact: StripeCustomerContact,
): Promise<ResolvedStripeCustomer> {
  assertCustomerOwnedByLink(customer, link)
  if (
    customer.name === contact.name
    && customer.email === contact.email
    && customer.phone === contact.phone
    && customer.metadata[STRIPE_CUSTOMER_USER_METADATA_KEY] === link.userId
    && customer.metadata[STRIPE_CUSTOMER_LINK_METADATA_KEY] === link.id
  ) {
    return { stripeCustomerId: customer.id }
  }
  const synchronized = await stripe.customers.update(customer.id, {
    name: contact.name,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    metadata: customerMetadata(link),
  }, {
    idempotencyKey: `stripe-customer-sync:${link.id}:${contactFingerprint(contact)}`,
  })
  assertCustomerOwnedByLink(synchronized, link)
  return { stripeCustomerId: synchronized.id }
}

async function retrieveBoundCustomer(
  stripe: Stripe,
  link: StripeCustomerLinkView,
  contact: StripeCustomerContact,
): Promise<ResolvedStripeCustomer> {
  if (!link.stripeCustomerId) throw new Error('STRIPE_CUSTOMER_BINDING_REQUIRED')
  const customer = await stripe.customers.retrieve(link.stripeCustomerId)
  if ('deleted' in customer && customer.deleted) {
    throw new Error('STRIPE_CUSTOMER_DELETED')
  }
  return await synchronizeStripeCustomer(stripe, link, customer, contact)
}

async function recoverExpiredCustomerCreation(
  stripe: Stripe,
  link: StripeCustomerLinkView,
): Promise<Stripe.Customer | null> {
  if (Date.now() - link.createdAt.getTime() < STRIPE_CUSTOMER_RECOVERY_AFTER_MS) return null

  const result = await stripe.customers.search({
    query: `metadata['${STRIPE_CUSTOMER_LINK_METADATA_KEY}']:'${link.id}'`,
    limit: 2,
  })
  const candidates = result.data.filter((customer) => (
    customer.metadata[STRIPE_CUSTOMER_LINK_METADATA_KEY] === link.id
    && customer.metadata[STRIPE_CUSTOMER_USER_METADATA_KEY] === link.userId
  ))
  if (candidates.length > 1) throw new Error('STRIPE_CUSTOMER_RECOVERY_CONFLICT')
  return candidates[0] ?? null
}

async function createOrRecoverStripeCustomer(
  stripe: Stripe,
  link: StripeCustomerLinkView,
  contact: StripeCustomerContact,
): Promise<ResolvedStripeCustomer> {
  const recovered = await recoverExpiredCustomerCreation(stripe, link)
  const customer = recovered ?? await stripe.customers.create(
    customerCreateParams(link, contact),
    { idempotencyKey: `stripe-customer:${link.id}` },
  )
  assertCustomerOwnedByLink(customer, link)
  await bindStripeCustomer(link, customer.id)
  return await synchronizeStripeCustomer(stripe, link, customer, contact)
}

/**
 * The only writer and resolver of the Wao-user -> Stripe-Customer identity.
 * Every payment creator must resolve this binding before creating its own
 * external object; routes and payment variants never interpret contact facts.
 */
export async function resolveStripeCustomerForUser(
  stripe: Stripe,
  userId: string,
): Promise<ResolvedStripeCustomer> {
  const link = await prisma.stripeCustomer.upsert({
    where: { userId },
    create: { userId },
    update: {},
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          accounts: {
            where: { provider: 'phone' },
            orderBy: { id: 'asc' },
            take: 2,
            select: { providerAccountId: true },
          },
        },
      },
    },
  })
  const contact = contactFromLink(link)
  return link.stripeCustomerId
    ? await retrieveBoundCustomer(stripe, link, contact)
    : await createOrRecoverStripeCustomer(stripe, link, contact)
}
