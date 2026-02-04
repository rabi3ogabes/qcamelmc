import { X, Sparkles, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CapacityNotificationBannerProps {
  ticketType: string;
  increase: number;
  newCapacity: number;
  onDismiss: () => void;
}

const typeLabels: Record<string, string> = {
  vip: 'VIP',
  normal: 'عادي',
  parking: 'مواقف'
};

const typeColors: Record<string, string> = {
  vip: 'from-amber-500 to-orange-500',
  normal: 'from-emerald-500 to-green-500',
  parking: 'from-blue-500 to-cyan-500'
};

export const CapacityNotificationBanner = ({
  ticketType,
  increase,
  newCapacity,
  onDismiss
}: CapacityNotificationBannerProps) => {
  return (
    <div 
      className={cn(
        "fixed top-4 left-4 right-4 z-50 mx-auto max-w-2xl",
        "animate-in slide-in-from-top-5 duration-500"
      )}
    >
      <div 
        className={cn(
          "relative overflow-hidden rounded-xl p-4 shadow-2xl",
          "bg-gradient-to-r",
          typeColors[ticketType] || typeColors.normal
        )}
      >
        {/* Animated background sparkles */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-4 -left-4 h-24 w-24 rounded-full bg-white/20 blur-xl animate-pulse" />
          <div className="absolute -bottom-4 -right-4 h-32 w-32 rounded-full bg-white/20 blur-xl animate-pulse delay-150" />
          <div className="absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30 blur-lg animate-ping" />
        </div>
        
        <div className="relative flex items-center gap-4">
          {/* Icon */}
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/30 backdrop-blur-sm animate-bounce">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          
          {/* Content */}
          <div className="flex-1 text-white">
            <div className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              <h3 className="text-lg font-bold">
                تذاكر جديدة متاحة للبيع!
              </h3>
            </div>
            <p className="mt-1 text-white/90 text-sm sm:text-base">
              تم إضافة <span className="font-bold text-xl">{increase}</span> تذكرة {typeLabels[ticketType] || ticketType}
              <span className="mx-2">•</span>
              الإجمالي: <span className="font-bold">{newCapacity}</span>
            </p>
          </div>
          
          {/* Dismiss button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="h-10 w-10 rounded-full bg-white/20 hover:bg-white/30 text-white shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        {/* Progress bar for auto-dismiss */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
          <div 
            className="h-full bg-white/60 animate-[shrink_10s_linear_forwards]"
            style={{
              animation: 'shrink 10s linear forwards'
            }}
          />
        </div>
      </div>
      
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};
