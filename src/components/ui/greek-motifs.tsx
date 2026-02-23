import type { SVGProps } from "react";

// The classical Meander (Greek Key) pattern
export function GreekKey(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 100 20" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" {...props}>
            <path
                d="M0,10 H10 V5 H20 V15 H5 V20"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
            />
            {/* Repeating segment */}
            <pattern id="meander" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M0,20 V5 H15 V15 H5 V10 H10" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#meander)" />
        </svg>
    );
}

// Laurel Wreath (Symbol of Apollo)
export function LaurelWreath(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
            <path
                d="M12 22C6.477 22 2 17.523 2 12C2 8.5 4 5 7 3"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <path
                d="M12 22C17.523 22 22 17.523 22 12C22 8.5 20 5 17 3"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            {/* Leaves Left */}
            <path d="M4 16C3 14 5 13 5 13C5 13 6 15 4 16Z" fill="currentColor" opacity="0.8" />
            <path d="M3 11C2 9 4 8 4 8C4 8 5 10 3 11Z" fill="currentColor" opacity="0.8" />
            <path d="M5 6C4 4 6 3 6 3C6 3 7 5 5 6Z" fill="currentColor" opacity="0.8" />
            {/* Leaves Right */}
            <path d="M20 16C21 14 19 13 19 13C19 13 18 15 20 16Z" fill="currentColor" opacity="0.8" />
            <path d="M21 11C22 9 20 8 20 8C20 8 19 10 21 11Z" fill="currentColor" opacity="0.8" />
            <path d="M19 6C20 4 18 3 18 3C18 3 17 5 19 6Z" fill="currentColor" opacity="0.8" />
        </svg>
    );
}

// Classical Sun Motif (Apollo the Sun God)
export function ApolloSun(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
            <circle cx="12" cy="12" r="4" strokeWidth="1.5" fill="currentColor" opacity="0.2" />
            <path d="M12 2V5" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M12 19V22" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M2 12H5" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M19 12H22" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M4.92896 4.92896L7.05028 7.05028" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M16.9497 16.9497L19.071 19.071" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M4.92896 19.071L7.05028 16.9497" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M16.9497 7.05028L19.071 4.92896" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}
