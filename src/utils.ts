import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function parseDuration(hrs: number, mins: number, secs: number): number {
  return (hrs * 3600) + (mins * 60) + secs;
}

export function getDurationParts(seconds: number) {
  return {
    hrs: Math.floor(seconds / 3600),
    mins: Math.floor((seconds % 3600) / 60),
    secs: seconds % 60
  };
}
