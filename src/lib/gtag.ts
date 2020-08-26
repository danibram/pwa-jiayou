import { GA_TRACKING_ID } from './env';

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export const pageview = (url) => {
    window.gtag('config', GA_TRACKING_ID, {
        page_path: url
    });
};

// https://developers.google.com/analytics/devguides/collection/gtagjs/events
export const event = ({
    action,
    category,
    label,
    value
}: {
    action: string;
    category: string;
    label?: string;
    value?: string;
}) => {
    let event = {
        event_category: category
    };

    if (label) {
        event['event_label'] = label;
    }

    if (value) {
        event['value'] = value;
    }

    window.gtag('event', action, event);
};

export const eventNi = ({ action, category, label, value }) => {
    window.gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value,
        non_interaction: true
    });
};
