-- Kullanıcı bazlı izinler.
--
-- Kolon boş dizi ile eklenir, ama mevcut satırlar boş bırakılamaz: o hâlde
-- migration'ın kendisi herkesi — süper admin dâhil — sistemden kilitler.
-- Bu yüzden her satır o anki rolünün şablonuyla doldurulur; yani yükseltme
-- sonrası kimsenin yetkisi değişmez, yalnızca artık tek tek kısılabilir hâle
-- gelir. Şablonlar @repo/types ROLE_DEFAULT_PERMISSIONS ile aynı olmalı.

ALTER TABLE "User" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "User" SET "permissions" = ARRAY[
  'products.view','products.manage','categories.manage','pricing.manage',
  'promotions.manage','companies.view','companies.manage','users.manage',
  'groups.manage','orders.view','orders.create','orders.approve','orders.fulfil',
  'visits.manage','cash.view','cash.manage','payment_terms.manage',
  'volume_tiers.manage','payments.view','documents.view','documents.manage',
  'reports.view','reports.build','organization.manage','erp.manage',
  'announcements.manage','activity.view','audit.view','audit.manage'
]::TEXT[] WHERE "role" = 'SUPER_ADMIN';

UPDATE "User" SET "permissions" = ARRAY[
  'products.view','companies.view','users.manage','orders.view','orders.create',
  'orders.approve','documents.view','reports.view','reports.build'
]::TEXT[] WHERE "role" = 'COMPANY_ADMIN';

UPDATE "User" SET "permissions" = ARRAY[
  'products.view','orders.view','orders.create','documents.view'
]::TEXT[] WHERE "role" = 'COMPANY_STAFF';

UPDATE "User" SET "permissions" = ARRAY[
  'products.view','companies.view','orders.view','orders.create','visits.manage',
  'cash.view','cash.manage','documents.view','reports.view','reports.build'
]::TEXT[] WHERE "role" = 'SALES_REP';
