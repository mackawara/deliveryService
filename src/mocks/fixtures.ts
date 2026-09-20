/**
 * Fixture data for local development and tests.
 *
 * The shapes are typed as the wire DTOs, so a fixture that drifts from the documented
 * contract fails the type check rather than silently teaching the UI a wrong shape.
 */
import type { Actor } from '@/api/dto/common';
import type { WireBooking, WireAssignment, WireDeliveryEvent, WireQuote } from '@/api/dto/booking';
import type { WireParcelPreset, WireRateCard, WireTown, WireZone } from '@/api/dto/configuration';
import type { WireCustomerDetail, WireCustomerRow } from '@/api/dto/customer';
import type { WireEnquiry } from '@/api/dto/enquiry';
import type { WireCashEntry, WirePaymentAttempt, WireRefund } from '@/api/dto/finance';
import type { WireCandidateResult, WireDriver, WirePresence, WireVehicle } from '@/api/dto/fleet';
import type { WireAuditEvent, WireOutboxEvent } from '@/api/dto/operations';
import type { WireFraudReport, WireRestriction } from '@/api/dto/restriction';
import type { WireStaffMember, WireStaffSession } from '@/api/dto/session';

const now = new Date('2026-09-20T09:00:00.000Z');

function iso(offsetMinutes: number): string {
  return new Date(now.getTime() + offsetMinutes * 60_000).toISOString();
}

const operatorActor: Actor = { type: 'OPERATOR', id: 'staff-1', label: 'Tariro M' };
const systemActor: Actor = { type: 'SYSTEM', id: 'whatsapp-adapter' };

export const towns: WireTown[] = [
  {
    _id: 'town-hwange',
    version: 4,
    createdAt: iso(-100000),
    updatedAt: iso(-500),
    slug: 'hwange',
    name: 'Hwange',
    timezone: 'Africa/Harare',
    currency: 'USD',
    serviceArea: {
      type: 'Polygon',
      coordinates: [
        [
          [26.4, -18.4],
          [26.6, -18.4],
          [26.6, -18.3],
          [26.4, -18.3],
          [26.4, -18.4],
        ],
      ],
    },
    operatingHours: [
      { day: 1, opensAt: '08:00', closesAt: '17:00' },
      { day: 2, opensAt: '08:00', closesAt: '17:00' },
    ],
    policy: {
      cancellationPolicy: 'Free cancellation before a driver is assigned.',
      waitingAllowancePolicy: 'Ten minutes of waiting is included at each endpoint.',
      retryAndReturnPolicy: 'One retry is attempted before a parcel is returned.',
      liabilityTerms: 'Liability is limited to the declared value.',
      prohibitedGoodsPolicy: 'No cash, alcohol or hazardous goods.',
      supportHours: 'Monday to Saturday, 08:00–17:00.',
      responseExpectations: 'Enquiries are answered within one working day.',
    },
    features: {
      bookingEnabled: true,
      cashOnDelivery: true,
      ecocash: true,
      paynowCheckout: true,
      independentDriverSignup: false,
    },
    supportContact: '+263770000000',
    status: 'ACTIVE',
  },
  {
    _id: 'town-victoria-falls',
    version: 2,
    createdAt: iso(-90000),
    updatedAt: iso(-4000),
    slug: 'victoria-falls',
    name: 'Victoria Falls',
    timezone: 'Africa/Harare',
    currency: 'USD',
    serviceArea: {
      type: 'Polygon',
      coordinates: [
        [
          [25.8, -17.95],
          [25.9, -17.95],
          [25.9, -17.85],
          [25.8, -17.85],
          [25.8, -17.95],
        ],
      ],
    },
    operatingHours: [],
    policy: { cancellationPolicy: 'Draft policy pending review.' },
    features: {
      bookingEnabled: false,
      cashOnDelivery: true,
      ecocash: false,
      paynowCheckout: false,
      independentDriverSignup: false,
    },
    status: 'ACTIVE',
  },
];

export const zones: WireZone[] = [
  {
    _id: 'zone-cbd',
    version: 1,
    createdAt: iso(-80000),
    updatedAt: iso(-80000),
    townId: 'town-hwange',
    code: 'CBD',
    label: 'Town centre',
    aliases: ['centre', 'downtown'],
    polygon: {
      type: 'Polygon',
      coordinates: [
        [
          [26.49, -18.37],
          [26.51, -18.37],
          [26.51, -18.35],
          [26.49, -18.35],
          [26.49, -18.37],
        ],
      ],
    },
    priority: 10,
    status: 'ACTIVE',
  },
  {
    _id: 'zone-colliery',
    version: 1,
    createdAt: iso(-80000),
    updatedAt: iso(-80000),
    townId: 'town-hwange',
    code: 'COLLIERY',
    label: 'Colliery',
    aliases: ['mine'],
    polygon: {
      type: 'Polygon',
      coordinates: [
        [
          [26.45, -18.39],
          [26.48, -18.39],
          [26.48, -18.36],
          [26.45, -18.36],
          [26.45, -18.39],
        ],
      ],
    },
    priority: 20,
    status: 'ACTIVE',
  },
  {
    _id: 'zone-empumalanga',
    version: 1,
    createdAt: iso(-80000),
    updatedAt: iso(-80000),
    townId: 'town-hwange',
    code: 'EMPUMALANGA',
    label: 'Empumalanga',
    aliases: [],
    polygon: {
      type: 'Polygon',
      coordinates: [
        [
          [26.52, -18.38],
          [26.55, -18.38],
          [26.55, -18.35],
          [26.52, -18.35],
          [26.52, -18.38],
        ],
      ],
    },
    priority: 30,
    status: 'ACTIVE',
  },
];

export const rateCards: WireRateCard[] = [
  {
    _id: 'rate-card-published',
    version: 3,
    createdAt: iso(-70000),
    updatedAt: iso(-6000),
    townId: 'town-hwange',
    status: 'PUBLISHED',
    currency: 'USD',
    effectiveFrom: iso(-6000),
    zonePairRates: [
      { fromZoneCode: 'CBD', toZoneCode: 'COLLIERY', parcelClass: 'SMALL', priceCents: 300 },
      { fromZoneCode: 'CBD', toZoneCode: 'EMPUMALANGA', parcelClass: 'SMALL', priceCents: 350 },
      { fromZoneCode: 'COLLIERY', toZoneCode: 'CBD', parcelClass: 'SMALL', priceCents: 300 },
      { fromZoneCode: 'CBD', toZoneCode: 'COLLIERY', parcelClass: 'MEDIUM', priceCents: 500 },
    ],
    extras: [
      {
        code: 'LOADING_HELP',
        label: 'Loading help',
        priceCents: 100,
        requiresCustomerAcceptance: true,
      },
    ],
    createdBy: operatorActor,
    publishedAt: iso(-6000),
    publishedBy: operatorActor,
  },
  {
    _id: 'rate-card-draft',
    version: 1,
    createdAt: iso(-200),
    updatedAt: iso(-200),
    townId: 'town-hwange',
    status: 'DRAFT',
    currency: 'USD',
    zonePairRates: [
      { fromZoneCode: 'CBD', toZoneCode: 'COLLIERY', parcelClass: 'SMALL', priceCents: 320 },
    ],
    extras: [],
    createdBy: operatorActor,
  },
];

export const parcelPresets: WireParcelPreset[] = [
  {
    _id: 'preset-small',
    version: 1,
    createdAt: iso(-70000),
    updatedAt: iso(-70000),
    townId: 'town-hwange',
    code: 'SMALL_BOX',
    label: 'Small box',
    examples: ['shoebox', 'A4 documents'],
    parcelClass: 'SMALL',
    maxWeightKg: 5,
    maxDimensionsCm: { lengthCm: 40, widthCm: 30, heightCm: 20 },
    supportedHandling: ['FRAGILE'],
    status: 'ACTIVE',
  },
  {
    _id: 'preset-medium',
    version: 1,
    createdAt: iso(-70000),
    updatedAt: iso(-70000),
    townId: 'town-hwange',
    code: 'MEDIUM_BOX',
    label: 'Medium box',
    examples: ['microwave', 'two grocery bags'],
    parcelClass: 'MEDIUM',
    maxWeightKg: 20,
    maxDimensionsCm: { lengthCm: 70, widthCm: 50, heightCm: 50 },
    supportedHandling: ['FRAGILE', 'KEEP_UPRIGHT'],
    status: 'ACTIVE',
  },
];

export const vehicles: WireVehicle[] = [
  {
    _id: 'vehicle-bike-1',
    version: 2,
    createdAt: iso(-60000),
    updatedAt: iso(-300),
    townId: 'town-hwange',
    registration: 'AEB 1234',
    vehicleClass: 'MOTORCYCLE',
    label: 'Delivery bike 1',
    capacity: {
      maxWeightKg: 15,
      cargoDimensionsCm: { lengthCm: 45, widthCm: 40, heightCm: 40 },
      accessOpeningCm: { widthCm: 38, heightCm: 38 },
    },
    handlingCapabilities: ['FRAGILE'],
    serviceStatus: 'IN_SERVICE',
    linkedDriverId: 'driver-1',
  },
  {
    _id: 'vehicle-van-1',
    version: 1,
    createdAt: iso(-60000),
    updatedAt: iso(-60000),
    townId: 'town-hwange',
    registration: 'AFC 8891',
    vehicleClass: 'VAN',
    capacity: {
      maxWeightKg: 800,
      cargoDimensionsCm: { lengthCm: 240, widthCm: 150, heightCm: 130 },
      accessOpeningCm: { widthCm: 120, heightCm: 120 },
    },
    handlingCapabilities: ['LOADING_HELP', 'KEEP_UPRIGHT'],
    serviceStatus: 'IN_SERVICE',
    linkedDriverId: 'driver-2',
  },
  {
    _id: 'vehicle-car-1',
    version: 1,
    createdAt: iso(-60000),
    updatedAt: iso(-1000),
    townId: 'town-hwange',
    registration: 'ADZ 4410',
    vehicleClass: 'CAR',
    capacity: {
      maxWeightKg: 120,
      cargoDimensionsCm: { lengthCm: 100, widthCm: 80, heightCm: 60 },
      accessOpeningCm: { widthCm: 70, heightCm: 55 },
    },
    handlingCapabilities: [],
    serviceStatus: 'MAINTENANCE',
  },
];

export const drivers: WireDriver[] = [
  {
    _id: 'driver-1',
    version: 5,
    createdAt: iso(-60000),
    updatedAt: iso(-120),
    townId: 'town-hwange',
    name: 'Blessing Ncube',
    normalizedPhone: '+263771000001',
    whatsappId: '263771000001',
    ownershipModel: 'COMPANY',
    allowedVehicleClasses: ['MOTORCYCLE'],
    assignedVehicleId: 'vehicle-bike-1',
    status: 'ACTIVE',
    approvalState: 'ACTIVATED',
    checks: { licenseExpiresAt: iso(200000), vehicleCheckedAt: iso(-20000) },
  },
  {
    _id: 'driver-2',
    version: 3,
    createdAt: iso(-58000),
    updatedAt: iso(-800),
    townId: 'town-hwange',
    name: 'Rudo Chirwa',
    normalizedPhone: '+263771000002',
    whatsappId: '263771000002',
    ownershipModel: 'COMPANY',
    allowedVehicleClasses: ['VAN', 'CAR'],
    assignedVehicleId: 'vehicle-van-1',
    status: 'ACTIVE',
    approvalState: 'APPROVED',
    checks: {},
  },
  {
    _id: 'driver-3',
    version: 2,
    createdAt: iso(-40000),
    updatedAt: iso(-3000),
    townId: 'town-hwange',
    name: 'Tapiwa Moyo',
    normalizedPhone: '+263771000003',
    whatsappId: '263771000003',
    ownershipModel: 'COMPANY',
    allowedVehicleClasses: ['CAR'],
    status: 'SUSPENDED',
    approvalState: 'DOCUMENTS_UNDER_REVIEW',
    checks: {},
    suspension: { reason: 'Licence document expired', by: operatorActor, at: iso(-3000) },
  },
];

export const presences: WirePresence[] = [
  {
    _id: 'presence-1',
    version: 12,
    createdAt: iso(-60000),
    updatedAt: iso(-4),
    driverId: 'driver-1',
    townId: 'town-hwange',
    availability: 'AVAILABLE',
    shift: { startedAt: iso(-180) },
    vehicleId: 'vehicle-bike-1',
    position: { type: 'Point', coordinates: [26.5, -18.36] },
    positionSource: 'DRIVER_PIN',
    positionReceivedAt: iso(-4),
    lastIdleSince: iso(-25),
  },
  {
    _id: 'presence-2',
    version: 8,
    createdAt: iso(-58000),
    updatedAt: iso(-95),
    driverId: 'driver-2',
    townId: 'town-hwange',
    availability: 'BUSY',
    requestedPostJobStatus: 'BREAK',
    shift: { startedAt: iso(-240) },
    vehicleId: 'vehicle-van-1',
    position: { type: 'Point', coordinates: [26.47, -18.38] },
    positionSource: 'OPERATOR_CONFIRMED',
    positionReceivedAt: iso(-95),
    currentBookingId: 'booking-transit',
    currentAssignmentId: 'assignment-2',
  },
];

const baseQuote: WireQuote = {
  _id: 'quote-1',
  version: 1,
  createdAt: iso(-400),
  updatedAt: iso(-400),
  bookingId: 'booking-ready',
  quoteId: 'quote-1',
  townId: 'town-hwange',
  rateCardId: 'rate-card-published',
  rateCardVersion: 3,
  parcelClass: 'SMALL',
  currency: 'USD',
  lineItems: [
    {
      code: 'ZONE_PAIR',
      label: 'CBD to Colliery',
      amountCents: 300,
      kind: 'ZONE_PAIR_RATE',
      acceptedByCustomer: true,
    },
  ],
  totalCents: 300,
  inputSnapshot: { fromZoneCode: 'CBD', toZoneCode: 'COLLIERY' },
  createdBy: systemActor,
  expiresAt: iso(600),
  acceptedAt: iso(-395),
  status: 'ACCEPTED',
};

export const quotes: WireQuote[] = [baseQuote];

function booking(
  overrides: Partial<WireBooking> & Pick<WireBooking, '_id' | 'status'>,
): WireBooking {
  return {
    version: 3,
    createdAt: iso(-420),
    updatedAt: iso(-60),
    townId: 'town-hwange',
    waybill: 'HWG-000123',
    customerId: 'customer-1',
    sender: { name: 'Nyasha Dube', phone: '+263772000001', whatsappId: '263772000001' },
    pickup: {
      zoneCode: 'CBD',
      addressLine: '14 Coronation Drive',
      landmark: 'Next to the pharmacy',
      pointSource: 'WHATSAPP_PIN',
      point: { type: 'Point', coordinates: [26.5, -18.36] },
      contactName: 'Nyasha Dube',
      contactPhone: '+263772000001',
      verified: true,
      needsOperatorConfirmation: false,
    },
    dropoff: {
      zoneCode: 'COLLIERY',
      addressLine: '9 Baobab Road',
      pointSource: 'NONE',
      contactName: 'Farai Sibanda',
      contactPhone: '+263772000002',
      verified: false,
      needsOperatorConfirmation: true,
    },
    parcel: {
      mode: 'PRESET',
      categoryCode: 'DOCUMENTS',
      quantity: 1,
      presetCode: 'SMALL_BOX',
      presetVersion: 1,
      declaredUpperBounds: {
        weightKg: 5,
        dimensionsCm: { lengthCm: 40, widthCm: 30, heightCm: 20 },
      },
      specialHandling: [],
      description: 'Sealed envelope of documents',
    },
    vehicleRequirement: {
      allowedClasses: ['MOTORCYCLE', 'CAR', 'VAN'],
      smallestSuitableClass: 'MOTORCYCLE',
      requiredHandling: [],
      unresolved: false,
      reasons: [],
    },
    photos: [],
    acceptedQuote: baseQuote,
    currentQuote: baseQuote,
    review: { required: false, reasons: [] },
    payment: {
      method: 'CASH_ON_DELIVERY',
      provider: 'NONE',
      payerRole: 'SENDER',
      cashCollectionPoint: 'DROPOFF',
      state: 'DUE_AT_DELIVERY',
      amountDueCents: 300,
      currency: 'USD',
    },
    eligibilityCheckVersion: 2,
    deliveryAttempts: 0,
    custody: { holder: 'SENDER', since: iso(-420) },
    source: 'WHATSAPP_FLOW',
    confirmedAt: iso(-395),
    holds: [],
    ...overrides,
  };
}

export const bookings: WireBooking[] = [
  booking({ _id: 'booking-ready', status: 'READY_FOR_DISPATCH', waybill: 'HWG-000123' }),
  booking({
    _id: 'booking-review',
    status: 'REVIEW_REQUIRED',
    waybill: undefined,
    review: {
      required: true,
      reasons: ['Drop-off location not confirmed'],
      requestedAt: iso(-200),
    },
    holds: [
      {
        code: 'OPERATOR_REVIEW',
        reason: 'Address needs confirmation',
        placedAt: iso(-200),
        placedBy: operatorActor,
      },
    ],
    acceptedQuote: undefined,
  }),
  booking({
    _id: 'booking-transit',
    status: 'IN_TRANSIT',
    waybill: 'HWG-000124',
    assignment: {
      assignmentId: 'assignment-2',
      driverId: 'driver-2',
      vehicleId: 'vehicle-van-1',
      assignedAt: iso(-90),
    },
    custody: { holder: 'DRIVER', driverId: 'driver-2', since: iso(-70) },
    payment: {
      method: 'ECOCASH',
      provider: 'PAYNOW',
      payerRole: 'SENDER',
      state: 'PAID',
      amountDueCents: 500,
      currency: 'USD',
      paidAt: iso(-300),
      lastAttemptId: 'payment-1',
    },
  }),
  booking({
    _id: 'booking-delivered',
    status: 'DELIVERED',
    waybill: 'HWG-000120',
    updatedAt: iso(-1500),
    custody: { holder: 'RECIPIENT', since: iso(-1500) },
    payment: {
      method: 'CASH_ON_DELIVERY',
      provider: 'NONE',
      payerRole: 'SENDER',
      state: 'PAID',
      amountDueCents: 300,
      currency: 'USD',
      paidAt: iso(-1500),
    },
  }),
];

export const assignments: WireAssignment[] = [
  {
    _id: 'assignment-2',
    version: 3,
    createdAt: iso(-95),
    updatedAt: iso(-90),
    bookingId: 'booking-transit',
    townId: 'town-hwange',
    driverId: 'driver-2',
    vehicleId: 'vehicle-van-1',
    state: 'ACCEPTED',
    active: true,
    offeredAt: iso(-95),
    offeredBy: operatorActor,
    offerExpiresAt: iso(-85),
    acceptedAt: iso(-90),
  },
];

export const deliveryEvents: WireDeliveryEvent[] = [
  {
    _id: 'event-1',
    bookingId: 'booking-transit',
    townId: 'town-hwange',
    priorState: 'ASSIGNED',
    newState: 'COLLECTED',
    actor: { type: 'DRIVER', id: 'driver-2', label: 'Rudo Chirwa' },
    assignmentId: 'assignment-2',
    occurredAt: iso(-70),
    receivedAt: iso(-70),
  },
  {
    _id: 'event-2',
    bookingId: 'booking-transit',
    townId: 'town-hwange',
    priorState: 'COLLECTED',
    newState: 'IN_TRANSIT',
    actor: { type: 'DRIVER', id: 'driver-2', label: 'Rudo Chirwa' },
    assignmentId: 'assignment-2',
    occurredAt: iso(-65),
    receivedAt: iso(-65),
  },
];

export const payments: WirePaymentAttempt[] = [
  {
    _id: 'payment-1',
    version: 4,
    createdAt: iso(-320),
    updatedAt: iso(-300),
    bookingId: 'booking-transit',
    townId: 'town-hwange',
    customerId: 'customer-1',
    amountCents: 500,
    currency: 'USD',
    method: 'ECOCASH',
    provider: 'PAYNOW',
    reference: 'DS-000998',
    providerReference: 'PN-77213',
    status: 'PAID',
    statusHistory: [
      { status: 'PENDING', at: iso(-318), source: 'INITIATE' },
      { status: 'PAID', at: iso(-300), source: 'WEBHOOK' },
    ],
    pollAttempts: 2,
    submittedAt: iso(-318),
    resolvedAt: iso(-300),
    appliedToBooking: true,
  },
  {
    _id: 'payment-2',
    version: 2,
    createdAt: iso(-45),
    updatedAt: iso(-20),
    bookingId: 'booking-ready',
    townId: 'town-hwange',
    customerId: 'customer-1',
    amountCents: 300,
    currency: 'USD',
    method: 'PAYNOW_CHECKOUT',
    provider: 'PAYNOW',
    reference: 'DS-001002',
    status: 'UNKNOWN',
    lastProviderStatus: 'Created',
    statusHistory: [{ status: 'SUBMITTED', at: iso(-44), source: 'INITIATE' }],
    pollAttempts: 5,
    nextPollAt: iso(5),
    submittedAt: iso(-44),
    appliedToBooking: false,
  },
];

export const cashEntries: WireCashEntry[] = [
  {
    _id: 'cash-1',
    version: 1,
    createdAt: iso(-1500),
    updatedAt: iso(-1500),
    bookingId: 'booking-delivered',
    townId: 'town-hwange',
    driverId: 'driver-1',
    entryType: 'COLLECTION',
    state: 'COLLECTED_BY_DRIVER',
    amountDueCents: 300,
    amountReceivedCents: 300,
    changeGivenCents: 0,
    payerRole: 'SENDER',
    recordedBy: operatorActor,
    occurredAt: iso(-1500),
    receiptReference: 'RCPT-0091',
    linkedEntryIds: [],
  },
  {
    _id: 'cash-2',
    version: 1,
    createdAt: iso(-60),
    updatedAt: iso(-60),
    bookingId: 'booking-ready',
    townId: 'town-hwange',
    entryType: 'DUE',
    state: 'DUE',
    amountDueCents: 300,
    payerRole: 'SENDER',
    recordedBy: systemActor,
    occurredAt: iso(-60),
    linkedEntryIds: [],
  },
];

export const refunds: WireRefund[] = [
  {
    _id: 'refund-1',
    version: 2,
    createdAt: iso(-800),
    updatedAt: iso(-700),
    bookingId: 'booking-delivered',
    townId: 'town-hwange',
    paymentAttemptId: 'payment-1',
    amountCents: 150,
    currency: 'USD',
    reason: 'Partial refund for a late delivery',
    status: 'REQUESTED',
    requestedBy: { type: 'FINANCE', id: 'staff-2', label: 'Chipo K' },
    manualWorkflowRequired: true,
  },
];

export const enquiries: WireEnquiry[] = [
  {
    _id: 'enquiry-1',
    version: 2,
    createdAt: iso(-240),
    updatedAt: iso(-100),
    ticketReference: 'ENQ-0042',
    townId: 'town-hwange',
    customerId: 'customer-1',
    whatsappIdentity: '263772000001',
    name: 'Nyasha Dube',
    category: 'DELIVERY_ISSUE',
    message: 'My parcel has not arrived and the driver is not answering.',
    status: 'OPEN',
    replies: [],
  },
  {
    _id: 'enquiry-2',
    version: 3,
    createdAt: iso(-2400),
    updatedAt: iso(-1200),
    ticketReference: 'ENQ-0039',
    townId: 'town-hwange',
    customerId: 'customer-2',
    whatsappIdentity: '263772000009',
    name: 'Kudzai B',
    category: 'PRICING_COVERAGE',
    message: 'Do you deliver to Empumalanga on Sundays?',
    status: 'RESOLVED',
    owner: operatorActor,
    replies: [
      {
        id: 'reply-1',
        body: 'We deliver to Empumalanga Monday to Saturday, 08:00 to 17:00.',
        author: operatorActor,
        sentAt: iso(-1200),
        channel: 'WHATSAPP',
      },
    ],
  },
];

export const customerRows: WireCustomerRow[] = [
  {
    id: 'customer-1',
    name: 'Nyasha Dube',
    phone: '+263772000001',
    townId: 'town-hwange',
    restrictionStatus: 'ALLOWED',
    version: 6,
  },
  {
    id: 'customer-2',
    name: 'Kudzai B',
    phone: '+263772000009',
    townId: 'town-hwange',
    restrictionStatus: 'RESTRICTED',
    version: 3,
  },
];

export const customerDetails: Record<string, WireCustomerDetail> = {
  'customer-1': {
    customer: {
      id: 'customer-1',
      name: 'Nyasha Dube',
      phone: '+263772000001',
      townId: 'town-hwange',
      savedAddresses: [
        {
          id: 'address-1',
          label: 'Home',
          zoneCode: 'CBD',
          addressLine: '14 Coronation Drive',
          verified: true,
          createdAt: iso(-90000),
        },
      ],
      consents: {
        serviceUpdates: { granted: true, grantedAt: iso(-90000), source: 'WHATSAPP' },
        marketing: { granted: false },
      },
      version: 6,
    },
    restrictionStatus: 'ALLOWED',
    activeRestrictions: [],
    risk: {
      customerId: 'customer-1',
      townId: 'town-hwange',
      windowDays: 90,
      bookings: { total: 12, delivered: 10, cancelled: 1, returned: 1, failedAttempts: 2 },
      cancellationRate: 0.08,
      cash: {
        openBookings: 1,
        openValueCents: 300,
        discrepancies: 0,
        outstandingDiscrepancyCents: 0,
      },
      payments: { failed: 1, unresolved: 1 },
    },
  },
  'customer-2': {
    customer: {
      id: 'customer-2',
      name: 'Kudzai B',
      phone: '+263772000009',
      townId: 'town-hwange',
      savedAddresses: [],
      consents: { serviceUpdates: { granted: true }, marketing: { granted: false } },
      version: 3,
    },
    restrictionStatus: 'RESTRICTED',
    activeRestrictions: [
      {
        id: 'restriction-1',
        reasonCode: 'REPEATED_PAYMENT_FRAUD',
        scope: { type: 'TOWN', townId: 'town-hwange' },
      },
    ],
    risk: null,
  },
};

export const restrictions: WireRestriction[] = [
  {
    _id: 'restriction-1',
    version: 2,
    createdAt: iso(-5000),
    updatedAt: iso(-5000),
    customerId: 'customer-2',
    subjectKey: '+263772000009',
    scopeKey: 'TOWN:town-hwange:+263772000009',
    scope: { type: 'TOWN', townId: 'town-hwange' },
    status: 'ACTIVE',
    reasonCode: 'REPEATED_PAYMENT_FRAUD',
    explanation: 'Three reversed EcoCash payments in one week after delivery.',
    evidence: [
      {
        kind: 'PAYMENT',
        reference: 'payment-1',
        note: 'Reversed after delivery',
        recordedAt: iso(-5000),
        recordedBy: operatorActor,
      },
    ],
    relatedBookingIds: ['booking-delivered'],
    effectiveFrom: iso(-5000),
    reviewAt: iso(40000),
    createdBy: { type: 'ADMIN', id: 'staff-3', label: 'Admin' },
  },
];

export const fraudReports: WireFraudReport[] = [
  {
    _id: 'fraud-1',
    version: 1,
    createdAt: iso(-5200),
    updatedAt: iso(-5000),
    bookingId: 'booking-delivered',
    customerId: 'customer-2',
    subjectKey: '+263772000009',
    reportedBy: operatorActor,
    reasonCode: 'REPEATED_PAYMENT_FRAUD',
    allegation: 'Payment reversed immediately after the parcel was handed over.',
    evidence: [],
    status: 'RESTRICTION_APPLIED',
    linkedRestrictionId: 'restriction-1',
  },
];

export const auditEvents: WireAuditEvent[] = [
  {
    _id: 'audit-1',
    actor: operatorActor,
    action: 'BOOKING_QUOTE_CREATED',
    entityType: 'booking',
    entityId: 'booking-ready',
    category: 'BOOKING',
    townId: 'town-hwange',
    occurredAt: iso(-400),
    reason: 'Customer added loading help',
    correlationId: 'corr-1a2b3c',
  },
  {
    _id: 'audit-2',
    actor: { type: 'FINANCE', id: 'staff-2', label: 'Chipo K' },
    action: 'REFUND_REQUESTED',
    entityType: 'refund',
    entityId: 'refund-1',
    category: 'FINANCE',
    townId: 'town-hwange',
    occurredAt: iso(-800),
    correlationId: 'corr-9f8e7d',
  },
];

export const notificationFailures: WireOutboxEvent[] = [
  {
    _id: 'outbox-1',
    type: 'WHATSAPP_TEMPLATE',
    status: 'FAILED',
    attempts: 3,
    nextAttemptAt: iso(10),
    createdAt: iso(-30),
    lastError: 'Template not approved for this language',
    correlationId: 'corr-5d4c3b',
    bookingId: 'booking-ready',
  },
];

export const candidateResult: WireCandidateResult = {
  ranked: [
    {
      driverId: 'driver-1',
      driverName: 'Blessing Ncube',
      vehicleId: 'vehicle-bike-1',
      registration: 'AEB 1234',
      vehicleClass: 'MOTORCYCLE',
      availability: 'AVAILABLE',
      distanceMeters: 1420,
      distanceKind: 'GEOGRAPHIC',
      locationAgeSeconds: 240,
      positionSource: 'DRIVER_PIN',
      locationFresh: true,
      idleSeconds: 1500,
      suitability: { fits: true, inspectionRequired: false, reasons: [] },
      presenceVersion: 12,
    },
  ],
  staleLocation: [
    {
      driverId: 'driver-2',
      driverName: 'Rudo Chirwa',
      vehicleId: 'vehicle-van-1',
      registration: 'AFC 8891',
      vehicleClass: 'VAN',
      availability: 'BUSY',
      distanceMeters: null,
      distanceKind: 'GEOGRAPHIC',
      locationAgeSeconds: 5700,
      positionSource: 'OPERATOR_CONFIRMED',
      locationFresh: false,
      idleSeconds: null,
      suitability: { fits: true, inspectionRequired: false, reasons: ['Currently on a job'] },
      presenceVersion: 8,
    },
  ],
  unsuitable: [
    {
      driverId: 'driver-3',
      driverName: 'Tapiwa Moyo',
      vehicleId: 'vehicle-car-1',
      registration: 'ADZ 4410',
      vehicleClass: 'CAR',
      availability: 'OFF_DUTY',
      distanceMeters: null,
      distanceKind: 'GEOGRAPHIC',
      locationAgeSeconds: null,
      locationFresh: false,
      idleSeconds: null,
      suitability: {
        fits: false,
        inspectionRequired: true,
        reasons: ['Vehicle is in maintenance', 'Driver suspended'],
      },
      presenceVersion: 1,
    },
  ],
  pickupPointAvailable: true,
};

export const staffSession: WireStaffSession = {
  user: { id: 'staff-1', name: 'Tariro M', maskedPhone: '+263••••••01' },
  roles: ['operator', 'finance', 'admin'],
  townAccess: { allTowns: true, towns: towns.map((town) => ({ id: town._id, name: town.name })) },
  capabilities: [
    'bookings.read',
    'bookings.write',
    'dispatch.assign',
    'drivers.read',
    'drivers.write',
    'vehicles.write',
    'customers.read',
    'enquiries.write',
    'payments.read',
    'payments.reconcile',
    'cash.collect',
    'cash.remit',
    'refunds.request',
    'refunds.approve',
    'refunds.settle',
    'fraud.report',
    'restrictions.manage',
    'configuration.read',
    'configuration.write',
    'audit.read',
    'staff.manage',
  ],
  session: { expiresAt: iso(480), idleExpiresAt: iso(30) },
};

export const staffMembers: WireStaffMember[] = [
  {
    id: 'staff-1',
    version: 3,
    createdAt: iso(-100000),
    updatedAt: iso(-100),
    name: 'Tariro M',
    maskedPhone: '+263••••••01',
    roles: ['operator', 'finance', 'admin'],
    townAccess: { allTowns: true, towns: [] },
    capabilities: staffSession.capabilities,
    status: 'ACTIVE',
    lastSignInAt: iso(-100),
  },
  {
    id: 'staff-2',
    version: 1,
    createdAt: iso(-90000),
    updatedAt: iso(-90000),
    name: 'Chipo K',
    maskedPhone: '+263••••••07',
    roles: ['finance'],
    townAccess: { allTowns: false, towns: [{ id: 'town-hwange', name: 'Hwange' }] },
    capabilities: ['payments.read', 'payments.reconcile', 'cash.remit', 'refunds.request'],
    status: 'ACTIVE',
  },
];

/** Fixed code accepted by the mock OTP endpoints in development and tests. */
export const MOCK_OTP_CODE = '123456';
