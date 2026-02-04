import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Volume2, VolumeX, Play } from "lucide-react";
import { Label } from "@/components/ui/label";

export interface NotificationSound {
  id: string;
  name: string;
  url: string;
}

export const NOTIFICATION_SOUNDS: NotificationSound[] = [
  {
    id: "bell",
    name: "جرس 🔔",
    url: "https://cdn.pixabay.com/audio/2024/02/19/audio_e4043e8c7f.mp3"
  },
  {
    id: "chime",
    name: "رنين ✨",
    url: "https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73467.mp3"
  },
  {
    id: "ding",
    name: "دينغ 🎵",
    url: "https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b87ed.mp3"
  },
  {
    id: "success",
    name: "نجاح ✅",
    url: "https://cdn.pixabay.com/audio/2021/08/04/audio_0625c1539c.mp3"
  },
  {
    id: "alert",
    name: "تنبيه ⚡",
    url: "https://cdn.pixabay.com/audio/2022/03/24/audio_805cb3d556.mp3"
  }
];

const STORAGE_KEY = "pos_notification_sound";
const MUTE_KEY = "pos_notification_muted";

export const getSelectedSound = (): NotificationSound => {
  const savedId = localStorage.getItem(STORAGE_KEY);
  return NOTIFICATION_SOUNDS.find(s => s.id === savedId) || NOTIFICATION_SOUNDS[0];
};

export const isSoundMuted = (): boolean => {
  return localStorage.getItem(MUTE_KEY) === "true";
};

interface NotificationSoundSelectorProps {
  onSoundChange?: (sound: NotificationSound) => void;
  onMuteChange?: (muted: boolean) => void;
}

export const NotificationSoundSelector = ({ 
  onSoundChange, 
  onMuteChange 
}: NotificationSoundSelectorProps) => {
  const [selectedSound, setSelectedSound] = useState<NotificationSound>(getSelectedSound);
  const [muted, setMuted] = useState<boolean>(isSoundMuted);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = 1.0;
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleSoundChange = (soundId: string) => {
    const sound = NOTIFICATION_SOUNDS.find(s => s.id === soundId);
    if (sound) {
      setSelectedSound(sound);
      localStorage.setItem(STORAGE_KEY, sound.id);
      onSoundChange?.(sound);
    }
  };

  const handleMuteToggle = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    localStorage.setItem(MUTE_KEY, String(newMuted));
    onMuteChange?.(newMuted);
  };

  const playPreview = () => {
    if (audioRef.current && !muted) {
      audioRef.current.src = selectedSound.url;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.log("Audio preview failed:", err);
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Label className="text-sm text-muted-foreground whitespace-nowrap">صوت الإشعار:</Label>
      <Select value={selectedSound.id} onValueChange={handleSoundChange}>
        <SelectTrigger className="w-[140px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NOTIFICATION_SOUNDS.map((sound) => (
            <SelectItem key={sound.id} value={sound.id}>
              {sound.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <Button 
        variant="outline" 
        size="icon" 
        className="h-9 w-9"
        onClick={playPreview}
        disabled={muted}
        title="تشغيل الصوت"
      >
        <Play className="h-4 w-4" />
      </Button>
      
      <Button 
        variant={muted ? "destructive" : "outline"} 
        size="icon" 
        className="h-9 w-9"
        onClick={handleMuteToggle}
        title={muted ? "تفعيل الصوت" : "كتم الصوت"}
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </Button>
    </div>
  );
};
