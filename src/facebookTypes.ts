export type FacebookEvent = {
    inputUrl: string;
    url: string;
    id: string;
    name: string;
    eventFrequency: "SINGLE" | "RECURRING";
    imageUrl: string;
    imageCaption: string;
    dateTimeSentence: string;
    utcStartDate: string;
    startTime: string;
    isCanceled: boolean;
    address: string;
    hasChildEvents: boolean;
    childEvents: unknown[];
    duration: string;
    description: string;

    usersGoing: number;
    usersInterested: number;
    usersResponded: number;

    location: FacebookEventLocation;
    ticketsInfo: unknown | null;

    organizedBy: string;
    organizators: FacebookEventOrganizer[];

    eventType: "PUBLIC" | "PRIVATE";
    isPast: boolean;
    isOnline: boolean;

    discoveryCategories: FacebookEventCategory[];
    externalLinks: string[];

    privacyInfo: string;
    paidContent: boolean;
    isClassEvent: boolean | null;
    isLiveAudioRoom: boolean;
    isRemoteLearningClass: boolean | null;
    isRemoteLearningCourse: boolean | null;
    groupEventPinnedToFeatured: boolean;
    hasRecordingAvailable: boolean;
};

export type FacebookEventLocation = {
    url: string;
    id: string;
    name: string;
    contextualName: string;
    placeType: string;
    latitude: number;
    longitude: number;
    countryCode: string;
    streetAddress: string;
    city: string;
};

export type FacebookEventOrganizer = {
    id: string;
    url: string;
    name: string;
    isVerified: boolean;
};

export type FacebookEventCategory = {
    url: string;
    label: string;
};
