export type ContentLinkRel =
  | 'http://identifiers.emc.com/linkrel/primary-content'
  | 'http://identifiers.emc.com/linkrel/content-media'
  | 'contents'
  | 'http://identifiers.emc.com/linkrel/edit-media';

export type VersionLinkRel =
  | 'http://identifiers.emc.com/linkrel/checkout'
  | 'http://identifiers.emc.com/linkrel/cancel-checkout'
  | 'http://identifiers.emc.com/linkrel/checkin-next-major'
  | 'http://identifiers.emc.com/linkrel/checkin-next-minor';

export const LINK_REL_PRIMARY_CONTENT = 'http://identifiers.emc.com/linkrel/primary-content';
export const LINK_REL_CONTENT_MEDIA = 'http://identifiers.emc.com/linkrel/content-media';
export const LINK_REL_CONTENTS = 'contents';
export const LINK_REL_CHECKOUT = 'http://identifiers.emc.com/linkrel/checkout';
export const LINK_REL_CANCEL_CHECKOUT = 'http://identifiers.emc.com/linkrel/cancel-checkout';
export const LINK_REL_CHECKIN_NEXT_MAJOR = 'http://identifiers.emc.com/linkrel/checkin-next-major';
export const LINK_REL_CHECKIN_NEXT_MINOR = 'http://identifiers.emc.com/linkrel/checkin-next-minor';
export const LINK_REL_DELETE = 'http://identifiers.emc.com/linkrel/delete';
export const LINK_REL_OBJECTS = 'http://identifiers.emc.com/linkrel/objects';
export const LINK_REL_EDIT_MEDIA = 'http://identifiers.emc.com/linkrel/edit-media';
