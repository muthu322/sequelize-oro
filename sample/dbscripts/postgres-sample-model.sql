--DROP DATABASE IF EXISTS "Northwind";
--CREATE DATABASE "Northwind";
-- Need to do the above separately, then reconnect to Northwind database

DROP TABLE IF EXISTS "OrderItem";
DROP TABLE IF EXISTS "Product";
DROP TABLE IF EXISTS "Supplier";
DROP TABLE IF EXISTS "Order";
DROP TABLE IF EXISTS "Customer";

DROP TABLE IF EXISTS order_item;
DROP TABLE IF EXISTS product;
DROP TABLE IF EXISTS supplier;
DROP TABLE IF EXISTS "order";
DROP TABLE IF EXISTS customer;

CREATE TABLE customer (
   id                   INT                 GENERATED BY DEFAULT AS IDENTITY ,
   first_name            VARCHAR(40)         NOT NULL,
   last_name             VARCHAR(40)         NOT NULL,
   city                 VARCHAR(40)         NULL,
   country              VARCHAR(40)         NULL,
   phone                VARCHAR(20)         NULL,
   CONSTRAINT "PK_Customer_Id" PRIMARY KEY (id),
   CONSTRAINT "UN_Customer_LastName_Firstname" UNIQUE (last_name, first_name)
);

CREATE TYPE StatusEnum AS ENUM ('UNKNOWN','SHIPPED','PROCESSING');
CREATE TABLE "order" (
   id                   INT                 GENERATED BY DEFAULT AS IDENTITY,
   order_date            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
   order_number          VARCHAR(10)         NULL,
   customer_id           INT                 NOT NULL,
   total_amount          DECIMAL(12,2)       NULL DEFAULT 0,
   status               StatusEnum          NOT NULL DEFAULT 'UNKNOWN',
   CONSTRAINT "PK_Order_Id" PRIMARY KEY (id),
   CONSTRAINT "UN_Order_CustomerId_OrderDate" UNIQUE (customer_id, order_date, order_number),
   CONSTRAINT "UN_Order_OrderNumber" UNIQUE (order_number)
);

CREATE TABLE order_item (
   id                   INT                  GENERATED BY DEFAULT AS IDENTITY,
   order_id              INT                  NOT NULL,
   product_id            INT                  NOT NULL,
   unit_price            DECIMAL(12,2)        NOT NULL DEFAULT 0,
   quantity             INT                  NOT NULL DEFAULT 1,
   CONSTRAINT "PK_OrderItem_Id" PRIMARY KEY (id),
   CONSTRAINT "UN_OrderItem_OrderId_ProductId" UNIQUE (order_id, product_id)
);

CREATE TABLE product (
   id                   INT                 GENERATED BY DEFAULT AS IDENTITY,
   product_name          VARCHAR(50)         NOT NULL,
   supplier_id           INT                 NOT NULL,
   alt_supplier_id       INT                 NULL,
   unit_price            DECIMAL(12,2)       NULL DEFAULT 0,
   package              VARCHAR(30)         NULL,
   is_discontinued       BOOLEAN             NOT NULL DEFAULT false,
   CONSTRAINT "PK_Product_Id" PRIMARY KEY (id),
   CONSTRAINT "UN_Product_ProductName" UNIQUE (product_name)
);

CREATE TABLE supplier (
   id                   INT                 GENERATED BY DEFAULT AS IDENTITY,
   company_name          VARCHAR(40)         NOT NULL,
   contact_name          VARCHAR(50)         NULL,
   contact_title         VARCHAR(40)         NULL,
   city                 VARCHAR(40)         NULL,
   country              VARCHAR(40)         NULL,
   phone                VARCHAR(30)         NULL,
   fax                  VARCHAR(30)         NULL,
   CONSTRAINT "PK_Supplier_Id" PRIMARY KEY (id),
   CONSTRAINT "UN_Supplier_CompanyName" UNIQUE (company_name, country)
);


ALTER TABLE "order"
  ADD CONSTRAINT "FK_Order_Customer" FOREIGN KEY (customer_id) REFERENCES customer (id);

ALTER TABLE order_item
   ADD CONSTRAINT "FK_OrderItem_Order" FOREIGN KEY (order_id) REFERENCES "order" (id);

ALTER TABLE order_item
   ADD CONSTRAINT "FK_OrderItem_Product" FOREIGN KEY (product_id) REFERENCES product (id);

ALTER TABLE product
   ADD CONSTRAINT "FK_Product_Supplier" FOREIGN KEY (supplier_id) REFERENCES supplier (id);

ALTER TABLE product
   ADD CONSTRAINT "FK_Product_Alt_Supplier" FOREIGN KEY (alt_supplier_id) REFERENCES supplier (id);