"use client";

export function ConstellationBg({ className }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className ?? ""}`}>
      {/* Star points */}
      {[
        { top: "8%", left: "12%", size: 2, delay: "0s" },
        { top: "15%", left: "78%", size: 3, delay: "1.2s" },
        { top: "22%", left: "45%", size: 1.5, delay: "0.6s" },
        { top: "35%", left: "88%", size: 2.5, delay: "2.1s" },
        { top: "42%", left: "5%", size: 2, delay: "1.8s" },
        { top: "55%", left: "32%", size: 1.5, delay: "0.3s" },
        { top: "62%", left: "68%", size: 3, delay: "2.7s" },
        { top: "72%", left: "92%", size: 2, delay: "1.5s" },
        { top: "78%", left: "18%", size: 2.5, delay: "0.9s" },
        { top: "85%", left: "55%", size: 1.5, delay: "2.4s" },
        { top: "10%", left: "35%", size: 1, delay: "3.0s" },
        { top: "48%", left: "52%", size: 1, delay: "1.0s" },
        { top: "30%", left: "22%", size: 2, delay: "2.0s" },
        { top: "90%", left: "75%", size: 1.5, delay: "0.4s" },
        { top: "5%", left: "60%", size: 2, delay: "1.7s" },
        { top: "68%", left: "40%", size: 1, delay: "2.8s" },
      ].map((star, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-[#4A8E9A] animate-twinkle"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: star.delay,
            animationDuration: `${3 + (i % 3)}s`,
          }}
        />
      ))}
    </div>
  );
}
