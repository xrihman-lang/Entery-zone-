import React from 'react';

export const LogoIcon = ({ className = "w-8 h-8", style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Dimensional Z in Royal Blue */}
    <path d="M20 25 L80 25 L35 75 L80 75" stroke="#1D4ED8" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
    {/* Upward Arrow / X shape in Neon Green */}
    <path d="M25 80 L80 20" stroke="#10B981" strokeWidth="10" strokeLinecap="round" />
    <path d="M55 20 L80 20 L80 45" stroke="#10B981" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Logo = ({ 
  iconClassName = "w-8 h-8", 
  textClassName = "text-xl",
  layout = "horizontal" 
}: { 
  iconClassName?: string, 
  textClassName?: string,
  layout?: "horizontal" | "vertical"
}) => {
  return (
    <div className={`flex ${layout === 'vertical' ? 'flex-col justify-center items-center gap-1' : 'items-center gap-2'}`}>
      <LogoIcon className={iconClassName} />
      <div className={`font-black tracking-tighter ${textClassName}`}>
        <span className="text-blue-700" style={{ color: '#1D4ED8' }}>ZISHAN</span>
        <span className="text-green-500 ml-1.5" style={{ color: '#10B981' }}>GDX</span>
      </div>
    </div>
  );
};
