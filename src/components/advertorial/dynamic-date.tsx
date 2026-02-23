"use client";

import { useState, useEffect } from "react";

export function DynamicDate() {
    const [displayDate, setDisplayDate] = useState("");

    useEffect(() => {
        // Set date to yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const day = yesterday.getDate().toString().padStart(2, '0');
        const month = (yesterday.getMonth() + 1).toString().padStart(2, '0');
        const year = yesterday.getFullYear();

        setDisplayDate(`${day}/${month}/${year} 12:11`);
    }, []);

    return (
        <span suppressHydrationWarning>
            {displayDate || "Carregando..."}
        </span>
    );
}
