import { ImageRun } from "docx";

export type FlowCvIconKey = "email" | "phone" | "location" | "linkedin";

const ICON_DISPLAY: Record<FlowCvIconKey, { width: number; height: number }> = {
  email: { width: 10, height: 10 },
  phone: { width: 8, height: 10 },
  location: { width: 8, height: 10 },
  linkedin: { width: 11, height: 10 },
};

const EMAIL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEWSURBVDhP5ZI9ioNQFIVVsBMsxFqws7FV3IIbcAliYekC0lrauAAR7Kwss45U2qipA8EfjJ5BYcIzbxICmS4XDvIu7/s4qAz+cZjHxSfzrbIkSWBZFgzDeBrTNOF5Hm63247dyeZ5Bs/zYBjmreR5TuJ72bIsCMMQqqpSIBlBEOC6Luq6JnFa1vf99iyKArZtg+O4u0TTNERRhMvlst3vuo7E97JxHCFJEoIgQFVV264sSxwOBxyPx+18vV4RxzF0XUeapiROy35brI3WZmvDtenpdILv+xBF8X7nbRkZWZbBsiy1fymbpokCXiXLMhKn/zPHcSjoryiKgrZtdywlW9/P+XzePvuzNE2DYRgeUVr2yXyJ7AfwYKyDpbKfsQAAAABJRU5ErkJggg==", "base64");
const PHONE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABEAAAAUCAYAAABroNZJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEwSURBVDhP3ZKxioNAFEWnSUCIX5AqnY1FvkHLfEYaG2Od1jZYhDQWdvoDEawEC3v9i4AgKXSLQEzuMoIPJ65uWFLtgVvou3MYhsfwAdjrj7/weUnTNMiyDK7r4nK59EeTkCSKIsiyDMZYm+12KzYnIMnxeCQBjyRJKMtSbI9AkvP5LEh4HMcR2yOQhL9BX7BYLJAkidgeQXjY9XpNkjRN+6NJBInneSQxTbM/mkSQ3G43qKpKosPhQLPH44E8z/F8PvtHWgbLxvdkPp+TyLZt3O937Pf79ltRFJxOJ9R1TWcGEk4YhpjNZiRarVbCo/NsNhvqs+qrBs8rcRxjuVwODncxDIO6P96k43q9YrfbCZvcxfd96k1KOqqqQhAEsCwLuq5D0zQURUHztyS/8c8k31/Dmf/42YbvAAAAAElFTkSuQmCC", "base64");
const LOCATION_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAATCAYAAACZZ43PAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFVSURBVDhPpZOxioNAEIY1JgZSpkxnaRUMaCsI6dOkkNS2+gIBwWdIlSfIU1jZBwTtBEliY3l3JAHROXbh5nbd5Li7/DCFM///Ma6uBC9Kevt4B1L/ldRv/FUCoOs62O/3YBgGTCYTmE6nsFqt4Hg89q1UHKBtW9hsNiBJklCKosDhcGDtVBxgt9txocFgwD2rqgqn04mNfAPI6pqmoXm73cL9fofL5QK6rmM/DMPHgLIs0TSfzynwS3me48yyLOwTIaAoCjQtl0vOVNc1zkzT5GYIIOsOh0N81zRNaZ9sEgQBAtbrNZvnD9HzPDSOx2NwXRccx8EeqTiO2QgPIOcwGo24AFu2bbN2KuFH8n1fCJKSZRmSJOnbRcD1eoXFYiEAoijqW6kEANH5fIbZbIZhchbsZ2X1EECUZRmFkHtwu936Y9SP17mqKmiapt/m9HSD3+plwCfJe9F0ZEFbNwAAAABJRU5ErkJggg==", "base64");
const LINKEDIN_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABYAAAAUCAYAAACJfM0wAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEASURBVDhP3dOtqoVAFAXgwSCKqCAWg2DVLvoEgi+g4MOJWO0GfQebJi0Wg9Eq7sts7gn+hDmHOXC5GxbMEvfHlCHwpSHXD7zmn8BBEAAhhDmapkHf9yfjEX4tGIYBuq7foKdUVXU2Tu136I+macK6rjDPM8iyfIOuYYbpbZdlgWmaQJKkG3QNM0yjqiooinJDLMsC27Y/g0VRxPO2bdi7rsNeFAUcx4Hnsiz5weM4Ir7vO3bf9/nAURRhr+sae5qmfGDP87DneY49yzI+sOu6fxQWBAGXkiTBHscxdvp8aQ/DELvjOOzwa/mdNE1zMh7hYRjwBqxp2/ZKPMM85mvwDwRPTrwbQuxqAAAAAElFTkSuQmCC", "base64");

const ICONS: Record<FlowCvIconKey, Buffer> = {
  email: EMAIL_PNG,
  phone: PHONE_PNG,
  location: LOCATION_PNG,
  linkedin: LINKEDIN_PNG,
};

export function flowCvIconRun(key: FlowCvIconKey): ImageRun {
  const size = ICON_DISPLAY[key];
  return new ImageRun({
    type: "png",
    data: ICONS[key],
    transformation: { width: size.width, height: size.height },
  });
}
